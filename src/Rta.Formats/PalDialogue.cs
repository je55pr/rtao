using System.Text;

namespace Rta.Formats;

/// <summary>
/// HG2's pre-text dialogue VM uses control bytes 0x01..0x1D. These names describe
/// only the pre-text scanner at PAL virtual address 0x0023C870. The same raw byte
/// can mean something different after visible text; post-text actions are represented
/// separately by <see cref="PalDialogueActionOpcode"/>.
/// </summary>
public enum PalDialogueOpcode : byte
{
    BranchIfFlagSet = 0x01,
    BranchIfFlagClear = 0x02,
    BranchIfIndexedFlagSet = 0x03,
    BranchIfInteractionState = 0x04,
    Unknown05 = 0x05,
    BranchIfStampSet = 0x06,
    BranchIfTeamIncomplete = 0x07,
    Unknown08 = 0x08,
    MenuMarker = 0x09,
    NewLine = 0x0A,
    BranchIfResultCodeEquals = 0x0B,
    PageBreak = 0x0C,
    Unknown0D = 0x0D,
    BranchByRallyStage = 0x0E,
    SetFlag = 0x0F,
    ClearFlag = 0x10,
    ClearIndexedFlag = 0x11,
    Action10 = 0x12,
    SetRallyStage = 0x13,
    Transition = 0x14,
    Unknown15 = 0x15,
    Unknown16 = 0x16,
    RegisterMyCityResident = 0x17,
    Unknown18 = 0x18,
    Unknown19 = 0x19,
    Unknown1A = 0x1A,
    WorldGrandPrixUnlockGate = 0x1B,
    BranchIfCurrentAreaEquals = 0x1C,
    Unknown1D = 0x1D,
}

/// <summary>
/// HG2's post-text/action dispatcher at PAL virtual address 0x0023D078. Only
/// operations whose behaviour has been traced receive semantic names.
/// </summary>
public enum PalDialogueActionOpcode : byte
{
    Unknown00 = 0x00,
    YesNoDefaultFirst = 0x01,
    YesNoDefaultSecond = 0x02,
    StartRace = 0x03,
    SelectTeamCar = 0x04,
    NumericChoice = 0x05,
    Unknown06 = 0x06,
    GrantIndexedFlag = 0x07,
    RaceSelect = 0x08,
    Menu = 0x09,
    Unknown0A = 0x0A,
    Unknown0B = 0x0B,
    Unknown0C = 0x0C,
    GrantStamps = 0x0D,
    SaveData = 0x0E,
    Unknown0F = 0x0F,
    Unknown10 = 0x10,
    Unknown11 = 0x11,
    Unknown12 = 0x12,
    Unknown13 = 0x13,
    Transition = 0x14,
    Unknown15 = 0x15,
    Unknown16 = 0x16,
    Unknown17 = 0x17,
    Unknown18 = 0x18,
}

public enum PalDialogueControlPhase
{
    PreText,
    InlineText,
}

public abstract record PalDialogueToken(int Offset);
public sealed record PalDialogueTextToken(int Offset, string Text) : PalDialogueToken(Offset);
public sealed record PalDialogueControlToken(
    int Offset,
    PalDialogueOpcode Opcode,
    IReadOnlyList<byte> Operands,
    PalDialogueControlPhase Phase = PalDialogueControlPhase.PreText) : PalDialogueToken(Offset);
public sealed record PalDialogueActionToken(
    int Offset,
    PalDialogueActionOpcode Opcode,
    IReadOnlyList<byte> Operands) : PalDialogueToken(Offset);
public sealed record PalDialogueMenuOption(
    IReadOnlyList<byte> Bytes,
    string Text,
    byte TargetSlot);
public sealed record PalDialogueMenuToken(
    int Offset,
    IReadOnlyList<PalDialogueMenuOption> Options) : PalDialogueToken(Offset);

public sealed record PalDialogueVariant(
    int PointerTableSlot,
    uint TextAddress,
    IReadOnlyList<byte> Bytes,
    IReadOnlyList<PalDialogueToken> Tokens,
    IReadOnlyList<string> Pages)
{
    public string RawText => Encoding.Latin1.GetString(Bytes.ToArray());
    public string DisplayText => string.Join("\n", Pages);

    public IEnumerable<PalDialogueControlToken> Controls => Tokens.OfType<PalDialogueControlToken>();
    public IEnumerable<PalDialogueControlToken> PreControls => Controls.Where(control => control.Phase == PalDialogueControlPhase.PreText);
    public IEnumerable<PalDialogueActionToken> Actions => Tokens.OfType<PalDialogueActionToken>();
    public IEnumerable<PalDialogueMenuToken> Menus => Tokens.OfType<PalDialogueMenuToken>();
}

public sealed record PalDialogueEntity(
    int AreaIndex,
    int EntityIndex,
    string Name,
    uint EntityAddress,
    IReadOnlyList<PalDialogueVariant> Variants)
{
    /// <summary>
    /// HG2 branch operands address the original pointer table, whose slot zero is the
    /// entity-name pointer. Dialogue slot N therefore resolves to the variant whose
    /// PointerTableSlot is N, not Variants[N]. Slot zero means no dialogue target.
    /// </summary>
    public PalDialogueVariant GetVariantByPointerTableSlot(int slot)
    {
        if (slot <= 0)
            throw new ArgumentOutOfRangeException(nameof(slot), "Dialogue target slot zero is the no-target/exit sentinel.");
        return Variants.FirstOrDefault(variant => variant.PointerTableSlot == slot)
            ?? throw new KeyNotFoundException($"Dialogue entity '{Name}' has no variant in pointer-table slot 0x{slot:X2}.");
    }

    public bool TryGetVariantByPointerTableSlot(int slot, out PalDialogueVariant? variant)
    {
        variant = slot <= 0 ? null : Variants.FirstOrDefault(candidate => candidate.PointerTableSlot == slot);
        return variant is not null;
    }

    /// <summary>
    /// A conservative first-pass greeting selector. HG2 stores state-specific variants in
    /// the entity block; the last text-only entry is the resident's generic fallback
    /// greeting in Peach Town's roaming-resident records.
    /// </summary>
    public PalDialogueVariant GetFallbackGreeting()
    {
        PalDialogueVariant? best = Variants.LastOrDefault(variant =>
            variant.Pages.Count > 0 &&
            !variant.Actions.Any() &&
            !variant.Menus.Any() &&
            variant.Controls.All(control => control.Opcode is PalDialogueOpcode.NewLine or PalDialogueOpcode.PageBreak));
        return best ?? Variants.LastOrDefault(variant => variant.Pages.Count > 0)
            ?? throw new InvalidDataException($"Dialogue entity '{Name}' contains no displayable variants.");
    }
}

/// <summary>
/// Phase-aware decoder for the PAL dialogue byte streams. HG2 first executes a
/// pre-text condition scanner, then renders printable text plus 0x0A/0x0C formatting,
/// then dispatches one terminal action. Raw opcode values are therefore not globally
/// unique instructions: for example 0x01 is a flag test before text but a Yes/No UI
/// action after text.
/// </summary>
public static class PalDialogueBytecode
{
    public const uint PreTextDispatcherAddress = 0x0023C870;
    public const uint ActionDispatcherAddress = 0x0023D078;

    private static readonly byte[] PreTextOperandCounts =
    {
        0, // 00 terminator
        2, 2, 3, 1, 2, 2, 1, 2, 0, 0,
        2, 0, 2, 6, 1, 1, 2, 0, 1, 2,
        1, 1, 1, 1, 2, 2, 1, 2, 3,
    };

    // -1 denotes a variable-length payload. Action 0x09 is a menu payload and
    // action 0x0D is a zero-terminated byte list. All other widths come directly
    // from the action handlers/callbacks reached by the 0x0023D078 dispatch table.
    private static readonly sbyte[] ActionOperandCounts =
    {
         0,  2,  2,  1,  1,  3,  1,  3,  2, -1,
         0,  2,  1, -1,  1,  0,  2,  2,  1,  1,
         2,  3,  3,  0,  0,
    };

    public static int GetPreTextOperandCount(byte opcode)
    {
        if (opcode is < 1 or > 0x1D)
            throw new ArgumentOutOfRangeException(nameof(opcode), $"HG2 pre-text dialogue opcode 0x{opcode:X2} is outside the traced 0x01..0x1D range.");
        return PreTextOperandCounts[opcode];
    }

    // Compatibility name retained for callers written during the first archaeology pass.
    public static int GetOperandCount(byte opcode) => GetPreTextOperandCount(opcode);

    public static int GetActionOperandCount(byte opcode)
    {
        if (opcode >= ActionOperandCounts.Length)
            throw new ArgumentOutOfRangeException(nameof(opcode), $"HG2 dialogue action 0x{opcode:X2} is outside the traced 0x00..0x18 dispatcher range.");
        return ActionOperandCounts[opcode];
    }

    public static IReadOnlyList<PalDialogueToken> Tokenize(IReadOnlyList<byte> bytes)
    {
        ArgumentNullException.ThrowIfNull(bytes);
        return TokenizeCore(bytes, out _);
    }

    internal static int MeasureLogicalLength(IReadOnlyList<byte> bytes)
    {
        ArgumentNullException.ThrowIfNull(bytes);
        TokenizeCore(bytes, out int consumedLength);
        return consumedLength;
    }

    private static IReadOnlyList<PalDialogueToken> TokenizeCore(IReadOnlyList<byte> bytes, out int consumedLength)
    {
        var tokens = new List<PalDialogueToken>();
        int offset = 0;
        bool textStarted = false;

        while (offset < bytes.Count)
        {
            byte value = bytes[offset];
            if (value == 0)
            {
                consumedLength = offset;
                return tokens;
            }

            if (!textStarted && value < 0x20)
            {
                if (value > 0x1D)
                {
                    tokens.Add(new PalDialogueControlToken(offset, (PalDialogueOpcode)value, Array.Empty<byte>()));
                    offset++;
                    continue;
                }

                int operandCount = GetPreTextOperandCount(value);
                EnsureAvailable(bytes, offset, operandCount, "pre-text opcode", value);
                byte[] operands = CopyBytes(bytes, offset + 1, operandCount);
                tokens.Add(new PalDialogueControlToken(offset, (PalDialogueOpcode)value, operands));
                offset += 1 + operandCount;
                continue;
            }

            textStarted = true;
            if (value >= 0x20)
            {
                int textStart = offset;
                while (offset < bytes.Count && bytes[offset] >= 0x20)
                    offset++;
                byte[] textBytes = CopyBytes(bytes, textStart, offset - textStart);
                tokens.Add(new PalDialogueTextToken(textStart, Encoding.Latin1.GetString(textBytes)));
                continue;
            }

            if (value is (byte)PalDialogueOpcode.NewLine or (byte)PalDialogueOpcode.PageBreak)
            {
                tokens.Add(new PalDialogueControlToken(
                    offset,
                    (PalDialogueOpcode)value,
                    Array.Empty<byte>(),
                    PalDialogueControlPhase.InlineText));
                offset++;
                continue;
            }

            if (value == (byte)PalDialogueActionOpcode.Menu)
            {
                // Q's Factory uses action 0x09 as the rich string-list menu format.
                // Roaming residents also use 0x09 with a single zero sentinel, so the
                // dispatcher action itself is contextual rather than globally "Menu".
                // An empty first payload cannot be a useful Q's Factory-style option;
                // preserve that short form as a raw action token instead.
                if (offset + 1 < bytes.Count && bytes[offset + 1] == 0)
                {
                    tokens.Add(new PalDialogueActionToken(offset, (PalDialogueActionOpcode)value, new byte[] { 0 }));
                    consumedLength = offset + 2;
                    return tokens;
                }

                PalDialogueMenuToken menu = ParseMenu(bytes, offset, out int menuEnd);
                tokens.Add(menu);
                consumedLength = menuEnd;
                return tokens;
            }

            if (value >= ActionOperandCounts.Length)
            {
                tokens.Add(new PalDialogueActionToken(offset, (PalDialogueActionOpcode)value, Array.Empty<byte>()));
                consumedLength = offset + 1;
                return tokens;
            }

            int actionOperandCount = GetActionOperandCount(value);
            if (value == (byte)PalDialogueActionOpcode.RaceSelect)
            {
                // Action 0x08 is context-sensitive. Q's Factory supplies two target
                // bytes (selected, cancelled), but roaming-resident streams commonly
                // use a leading zero sentinel with no second byte. The dispatcher
                // forwards the payload to a callback rather than reading a globally
                // fixed-width structure itself.
                EnsureAvailable(bytes, offset, 1, "action", value);
                int contextualWidth = bytes[offset + 1] == 0 ? 1 : 2;
                EnsureAvailable(bytes, offset, contextualWidth, "action", value);
                byte[] contextualOperands = CopyBytes(bytes, offset + 1, contextualWidth);
                tokens.Add(new PalDialogueActionToken(offset, (PalDialogueActionOpcode)value, contextualOperands));
                consumedLength = offset + 1 + contextualWidth;
                return tokens;
            }

            if (value == (byte)PalDialogueActionOpcode.GrantStamps)
            {
                int cursor = offset + 1;
                while (cursor < bytes.Count && bytes[cursor] != 0)
                    cursor++;
                if (cursor >= bytes.Count)
                    throw new InvalidDataException($"Dialogue action 0x{value:X2} at +0x{offset:X} has no terminating zero.");
                byte[] list = CopyBytes(bytes, offset + 1, cursor - offset - 1);
                tokens.Add(new PalDialogueActionToken(offset, (PalDialogueActionOpcode)value, list));
                // Preserve the list terminator when this tokenizer is being used to
                // measure a speculative ELF read. ReadVariantBytes tokenizes the trimmed
                // result again, and action 0x0D is structurally defined by this NUL.
                consumedLength = cursor + 1;
                return tokens;
            }

            if (actionOperandCount < 0)
                throw new InvalidDataException($"Dialogue action 0x{value:X2} at +0x{offset:X} has an unhandled variable-length payload.");

            EnsureAvailable(bytes, offset, actionOperandCount, "action", value);
            byte[] actionOperands = CopyBytes(bytes, offset + 1, actionOperandCount);
            tokens.Add(new PalDialogueActionToken(offset, (PalDialogueActionOpcode)value, actionOperands));
            consumedLength = offset + 1 + actionOperandCount;
            return tokens;
        }

        consumedLength = bytes.Count;
        return tokens;
    }

    private static PalDialogueMenuToken ParseMenu(IReadOnlyList<byte> bytes, int opcodeOffset, out int menuEnd)
    {
        int cursor = opcodeOffset + 1;
        var rawOptions = new List<byte[]>();

        while (cursor < bytes.Count)
        {
            int optionStart = cursor;
            while (cursor < bytes.Count && bytes[cursor] != 0)
                cursor++;
            if (cursor >= bytes.Count)
                throw new InvalidDataException($"Dialogue menu at +0x{opcodeOffset:X} has an unterminated option string.");

            rawOptions.Add(CopyBytes(bytes, optionStart, cursor - optionStart));
            cursor++; // option NUL

            if (cursor < bytes.Count && bytes[cursor] == (byte)PalDialogueActionOpcode.Menu)
            {
                cursor++; // second 0x09 separates option strings from target slots
                break;
            }
        }

        if (rawOptions.Count == 0)
            throw new InvalidDataException($"Dialogue menu at +0x{opcodeOffset:X} contains no options.");
        if (cursor + rawOptions.Count > bytes.Count)
            throw new InvalidDataException($"Dialogue menu at +0x{opcodeOffset:X} is missing one or more target slots.");

        var options = new List<PalDialogueMenuOption>(rawOptions.Count);
        for (int i = 0; i < rawOptions.Count; i++)
        {
            byte targetSlot = bytes[cursor + i];
            byte[] raw = rawOptions[i];
            options.Add(new PalDialogueMenuOption(raw, DecodeMenuOption(raw), targetSlot));
        }
        cursor += rawOptions.Count;
        menuEnd = cursor;
        return new PalDialogueMenuToken(opcodeOffset, options);
    }

    private static string DecodeMenuOption(IReadOnlyList<byte> bytes)
    {
        var text = new StringBuilder();
        foreach (byte value in bytes)
        {
            if (value >= 0x20)
                text.Append((char)value);
            else if (value == (byte)PalDialogueOpcode.NewLine)
                text.Append('\n');
            // Other C0 bytes are UI-format markers inside the option string. Preserve
            // them in PalDialogueMenuOption.Bytes but do not expose them as text.
        }
        return text.ToString().Trim();
    }

    private static void EnsureAvailable(IReadOnlyList<byte> bytes, int opcodeOffset, int operandCount, string kind, byte opcode)
    {
        if (opcodeOffset + 1 + operandCount > bytes.Count)
            throw new InvalidDataException($"Dialogue {kind} 0x{opcode:X2} at +0x{opcodeOffset:X} is truncated.");
    }

    private static byte[] CopyBytes(IReadOnlyList<byte> bytes, int offset, int count)
    {
        var result = new byte[count];
        for (int i = 0; i < count; i++)
            result[i] = bytes[offset + i];
        return result;
    }

    public static IReadOnlyList<string> DecodeDisplayPages(IReadOnlyList<PalDialogueToken> tokens)
    {
        ArgumentNullException.ThrowIfNull(tokens);
        var pages = new List<string>();
        var current = new StringBuilder();
        foreach (PalDialogueToken token in tokens)
        {
            switch (token)
            {
                case PalDialogueTextToken text:
                    current.Append(text.Text);
                    break;
                case PalDialogueControlToken { Opcode: PalDialogueOpcode.NewLine }:
                    current.Append('\n');
                    break;
                case PalDialogueControlToken { Opcode: PalDialogueOpcode.PageBreak }:
                    FlushPage(current, pages);
                    break;
            }
        }
        FlushPage(current, pages);
        return pages;
    }

    private static void FlushPage(StringBuilder current, List<string> pages)
    {
        string page = current.ToString().Trim();
        current.Clear();
        if (page.Length > 0)
            pages.Add(page);
    }
}

/// <summary>
/// Clean-room reader for the multilingual dialogue pointer hierarchy in PAL SLES_513.56.
/// Root 0x002A4620 -> language -> area -> entity -> bytecode/text stream.
/// </summary>
public static class PalDialogueDatabase
{
    public const uint RootAddress = 0x002A4620;
    public const int EnglishLanguageIndex = 0;
    public const int PeachTownAreaIndex = 1;
    private const int MaxVariantBytes = 4096;
    private const uint MaxLocalVariantGap = 4096;

    public static PalDialogueEntity ReadPeachTownEntity(Stream executable, string name) =>
        ReadEntity(executable, EnglishLanguageIndex, PeachTownAreaIndex, name);

    public static PalDialogueEntity ReadEntity(Stream executable, int languageIndex, int areaIndex, string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        if (languageIndex is < 0 or > 2)
            throw new ArgumentOutOfRangeException(nameof(languageIndex));
        if (areaIndex is < 0 or >= 32)
            throw new ArgumentOutOfRangeException(nameof(areaIndex));

        var elf = new Elf32AddressSpace(executable);
        uint languageTable = elf.ReadUInt32(RootAddress + (uint)(languageIndex * 4));
        if (languageTable == 0)
            throw new InvalidDataException($"Dialogue language {languageIndex} has no pointer table.");
        uint areaTable = elf.ReadUInt32(languageTable + (uint)(areaIndex * 4));
        if (areaTable == 0)
            throw new InvalidDataException($"Dialogue area {areaIndex} has no entity table.");

        var entityAddresses = new List<uint>();
        for (int i = 0; i < 128; i++)
        {
            uint address = elf.ReadUInt32(areaTable + (uint)(i * 4));
            if (address == 0)
                break;
            // Entity records precede their pointer table in the PAL data layout.
            if (!elf.IsFileBacked(address, 4) || address >= areaTable)
                break;
            entityAddresses.Add(address);
        }

        for (int i = 0; i < entityAddresses.Count; i++)
        {
            uint entityAddress = entityAddresses[i];
            uint nameAddress = elf.ReadUInt32(entityAddress);
            if (!elf.IsFileBacked(nameAddress))
                continue;
            string entityName = elf.ReadAsciiZ(nameAddress, 128);
            if (!string.Equals(entityName, name, StringComparison.OrdinalIgnoreCase))
                continue;

            uint entityEnd = i + 1 < entityAddresses.Count ? entityAddresses[i + 1] : areaTable;
            var pointers = new List<(int Slot, uint Address)>();
            int slot = 1;
            for (uint address = entityAddress + 4; address + 4 <= entityEnd; address += 4, slot++)
            {
                uint textAddress = elf.ReadUInt32(address);
                if (textAddress == 0 || !elf.IsFileBacked(textAddress))
                    continue;
                pointers.Add((slot, textAddress));
            }

            var variants = new List<PalDialogueVariant>(pointers.Count);
            uint[] localAddresses = pointers.Select(pointer => pointer.Address).Distinct().Order().ToArray();
            foreach ((int pointerTableSlot, uint textAddress) in pointers)
            {
                uint? localEnd = localAddresses
                    .Where(address => address > textAddress && address - textAddress <= MaxLocalVariantGap)
                    .Cast<uint?>()
                    .FirstOrDefault();

                byte[] bytes = ReadVariantBytes(elf, textAddress, localEnd);
                IReadOnlyList<PalDialogueToken> tokens;
                try
                {
                    tokens = PalDialogueBytecode.Tokenize(bytes);
                }
                catch (InvalidDataException ex)
                {
                    throw new InvalidDataException(
                        $"Dialogue entity '{entityName}' slot 0x{pointerTableSlot:X2} at 0x{textAddress:X8} could not be tokenized: {ex.Message}",
                        ex);
                }
                IReadOnlyList<string> pages = PalDialogueBytecode.DecodeDisplayPages(tokens);
                variants.Add(new PalDialogueVariant(pointerTableSlot, textAddress, bytes, tokens, pages));
            }

            return new PalDialogueEntity(areaIndex, i, entityName, entityAddress, variants);
        }

        throw new KeyNotFoundException($"Dialogue entity '{name}' was not found in area {areaIndex}.");
    }

    /// <summary>
    /// Compatibility helper for callers/tests that already have a raw dialogue byte string.
    /// New executable readers should tokenize bytes directly so opcode operands cannot be
    /// mistaken for text or NUL terminators.
    /// </summary>
    public static IReadOnlyList<string> DecodeDisplayPages(string raw)
    {
        if (string.IsNullOrEmpty(raw))
            return Array.Empty<string>();
        byte[] bytes = Encoding.Latin1.GetBytes(raw);
        return PalDialogueBytecode.DecodeDisplayPages(PalDialogueBytecode.Tokenize(bytes));
    }

    private static byte[] ReadVariantBytes(Elf32AddressSpace elf, uint textAddress, uint? localEnd)
    {
        int length = localEnd.HasValue
            ? checked((int)(localEnd.Value - textAddress))
            : FindFileBackedLength(elf, textAddress, MaxVariantBytes);
        if (length <= 0 || length > MaxVariantBytes)
            throw new InvalidDataException($"Dialogue stream at 0x{textAddress:X8} has implausible length {length}.");

        byte[] bytes = elf.ReadBytes(textAddress, length);
        int meaningfulLength = PalDialogueBytecode.MeasureLogicalLength(bytes);
        return meaningfulLength == bytes.Length ? bytes : bytes.AsSpan(0, meaningfulLength).ToArray();
    }

    private static int FindFileBackedLength(Elf32AddressSpace elf, uint address, int maximumLength)
    {
        if (maximumLength <= 0 || !elf.IsFileBacked(address))
            return 0;

        int low = 1;
        int high = maximumLength;
        while (low < high)
        {
            int candidate = low + ((high - low + 1) / 2);
            if (elf.IsFileBacked(address, candidate))
                low = candidate;
            else
                high = candidate - 1;
        }
        return low;
    }
}

public interface IDialogueFlagStore
{
    bool IsSet(string flag);
    void Set(string flag, bool value);
}

public sealed class DialogueFlagStore : IDialogueFlagStore
{
    private readonly HashSet<string> _flags = new(StringComparer.Ordinal);
    public bool IsSet(string flag) => _flags.Contains(flag);
    public void Set(string flag, bool value)
    {
        if (value) _flags.Add(flag);
        else _flags.Remove(flag);
    }
}

public abstract record DialogueNode(int Id);
public sealed record DialogueTextNode(int Id, string Speaker, string Text, int NextId) : DialogueNode(Id);
public sealed record DialogueChoice(string Text, int NextId);
public sealed record DialogueChoiceNode(int Id, string Speaker, string Prompt, IReadOnlyList<DialogueChoice> Choices) : DialogueNode(Id);
public sealed record DialogueConditionNode(int Id, string Flag, int IfSetId, int IfUnsetId) : DialogueNode(Id);
public sealed record DialogueSetFlagNode(int Id, string Flag, bool Value, int NextId) : DialogueNode(Id);
public sealed record DialogueEndNode(int Id) : DialogueNode(Id);

public sealed record DialogueScript(int StartNodeId, IReadOnlyDictionary<int, DialogueNode> Nodes)
{
    public static DialogueScript FromSingleText(string speaker, string text)
    {
        var nodes = new Dictionary<int, DialogueNode>
        {
            [0] = new DialogueTextNode(0, speaker, text, 1),
            [1] = new DialogueEndNode(1)
        };
        return new DialogueScript(0, nodes);
    }
}

/// <summary>
/// Small data-driven dialogue interpreter. Visible text/choice nodes pause for input;
/// condition/set nodes resolve immediately. This is independent of MonoGame so it can
/// later execute decoded HG2 control flow without coupling game state to the UI.
/// </summary>
public sealed class DialogueMachine
{
    private readonly DialogueScript _script;
    private readonly IDialogueFlagStore _flags;

    public DialogueMachine(DialogueScript script, IDialogueFlagStore flags)
    {
        _script = script;
        _flags = flags;
        CurrentNodeId = script.StartNodeId;
        ResolveAutomaticNodes();
    }

    public int CurrentNodeId { get; private set; }
    public DialogueNode CurrentNode => _script.Nodes[CurrentNodeId];
    public bool IsEnded => CurrentNode is DialogueEndNode;
    public DialogueTextNode? CurrentText => CurrentNode as DialogueTextNode;
    public DialogueChoiceNode? CurrentChoice => CurrentNode as DialogueChoiceNode;

    public void Advance()
    {
        if (CurrentNode is DialogueTextNode text)
        {
            CurrentNodeId = text.NextId;
            ResolveAutomaticNodes();
        }
    }

    public void Choose(int index)
    {
        if (CurrentNode is not DialogueChoiceNode choice)
            throw new InvalidOperationException("Current dialogue node is not a choice.");
        if ((uint)index >= (uint)choice.Choices.Count)
            throw new ArgumentOutOfRangeException(nameof(index));
        CurrentNodeId = choice.Choices[index].NextId;
        ResolveAutomaticNodes();
    }

    private void ResolveAutomaticNodes()
    {
        for (int safety = 0; safety < 256; safety++)
        {
            DialogueNode node = _script.Nodes[CurrentNodeId];
            switch (node)
            {
                case DialogueConditionNode condition:
                    CurrentNodeId = _flags.IsSet(condition.Flag) ? condition.IfSetId : condition.IfUnsetId;
                    continue;
                case DialogueSetFlagNode set:
                    _flags.Set(set.Flag, set.Value);
                    CurrentNodeId = set.NextId;
                    continue;
                default:
                    return;
            }
        }
        throw new InvalidDataException("Dialogue script exceeded automatic-node safety limit; possible loop.");
    }
}

/// <summary>
/// Minimal runtime state used by the traced PAL dialogue VM. This deliberately keeps
/// byte-indexed HG2 flags byte-indexed: semantic names should only be layered on once
/// individual banks/flags have been proven by executable tracing.
/// </summary>
public sealed class PalDialogueRuntimeState
{
    private readonly HashSet<byte> _flags = new();

    public int CurrentAreaIndex { get; set; }
    public int RallyStage { get; set; }
    public int? ResultCode { get; set; }
    public bool TeamIncomplete { get; set; }
    public bool WorldGrandPrixUnlocked { get; set; }

    public bool IsFlagSet(byte flag) => _flags.Contains(flag);

    public void SetFlag(byte flag, bool value)
    {
        if (value)
            _flags.Add(flag);
        else
            _flags.Remove(flag);
    }

    public IReadOnlyCollection<byte> Flags => _flags;
}

public sealed record PalDialogueFlowChoice(string Text, byte TargetSlot, bool IsDefault = false);

/// <summary>
/// Phase-aware executor for the subset of HG2's PAL dialogue VM whose control-flow
/// semantics have been traced. The executor owns only dialogue routing/state. Actions
/// which invoke other game systems (race picker, parts UI, save data, transitions, ...)
/// remain visible as <see cref="CurrentExternalAction"/> for the host game to handle.
/// </summary>
public sealed class PalDialogueFlow
{
    private const int SafetyLimit = 256;
    private readonly PalDialogueEntity _entity;
    private readonly PalDialogueRuntimeState _state;
    private readonly List<PalDialogueControlToken> _ignoredControls = new();
    private int _pageIndex;

    public PalDialogueFlow(PalDialogueEntity entity, PalDialogueRuntimeState state, byte startSlot)
    {
        _entity = entity ?? throw new ArgumentNullException(nameof(entity));
        _state = state ?? throw new ArgumentNullException(nameof(state));
        EnterSlot(startSlot);
    }

    public PalDialogueVariant? CurrentVariant { get; private set; }
    public int CurrentSlot => CurrentVariant?.PointerTableSlot ?? 0;
    public bool IsEnded { get; private set; }
    public int PageIndex => _pageIndex;
    public string? CurrentPage => CurrentVariant is { Pages.Count: > 0 } variant
        ? variant.Pages[Math.Clamp(_pageIndex, 0, variant.Pages.Count - 1)]
        : null;
    public PalDialogueMenuToken? CurrentMenu => CurrentVariant?.Menus.SingleOrDefault();
    public PalDialogueActionToken? CurrentAction => CurrentVariant?.Actions.SingleOrDefault();
    public PalDialogueActionToken? CurrentExternalAction => CurrentAction is { Opcode: not PalDialogueActionOpcode.YesNoDefaultFirst and not PalDialogueActionOpcode.YesNoDefaultSecond }
        ? CurrentAction
        : null;
    public IReadOnlyList<PalDialogueControlToken> IgnoredControls => _ignoredControls;

    public IReadOnlyList<PalDialogueFlowChoice> CurrentChoices
    {
        get
        {
            if (CurrentMenu is PalDialogueMenuToken menu)
                return menu.Options.Select(option => new PalDialogueFlowChoice(option.Text, option.TargetSlot)).ToArray();

            if (CurrentAction is { Opcode: PalDialogueActionOpcode.YesNoDefaultFirst or PalDialogueActionOpcode.YesNoDefaultSecond } action)
            {
                bool firstDefault = action.Opcode == PalDialogueActionOpcode.YesNoDefaultFirst;
                return new[]
                {
                    new PalDialogueFlowChoice("Yes", action.Operands[0], firstDefault),
                    new PalDialogueFlowChoice("No", action.Operands[1], !firstDefault),
                };
            }

            return Array.Empty<PalDialogueFlowChoice>();
        }
    }

    public void Advance()
    {
        if (IsEnded || CurrentVariant is null)
            return;

        if (_pageIndex + 1 < CurrentVariant.Pages.Count)
        {
            _pageIndex++;
            return;
        }

        // A choice or host-system action owns completion once its visible text has
        // been consumed. Text-only variants naturally terminate the interaction.
        if (CurrentChoices.Count > 0 || CurrentExternalAction is not null)
            return;

        IsEnded = true;
        CurrentVariant = null;
    }

    public void Choose(int index)
    {
        IReadOnlyList<PalDialogueFlowChoice> choices = CurrentChoices;
        if ((uint)index >= (uint)choices.Count)
            throw new ArgumentOutOfRangeException(nameof(index));
        EnterSlot(choices[index].TargetSlot);
    }

    public void ReturnFromExternalAction(byte targetSlot) => EnterSlot(targetSlot);

    private void EnterSlot(byte slot)
    {
        _ignoredControls.Clear();
        _pageIndex = 0;
        if (slot == 0)
        {
            IsEnded = true;
            CurrentVariant = null;
            return;
        }

        IsEnded = false;
        int currentSlot = slot;
        for (int safety = 0; safety < SafetyLimit; safety++)
        {
            PalDialogueVariant variant = _entity.GetVariantByPointerTableSlot(currentSlot);
            byte branchTarget = 0;
            bool branched = false;

            foreach (PalDialogueControlToken control in variant.PreControls)
            {
                switch (control.Opcode)
                {
                    case PalDialogueOpcode.BranchIfFlagSet:
                        if (_state.IsFlagSet(control.Operands[0]))
                        {
                            branchTarget = control.Operands[1];
                            branched = true;
                        }
                        break;
                    case PalDialogueOpcode.BranchIfFlagClear:
                        if (!_state.IsFlagSet(control.Operands[0]))
                        {
                            branchTarget = control.Operands[1];
                            branched = true;
                        }
                        break;
                    case PalDialogueOpcode.BranchIfResultCodeEquals:
                        if (_state.ResultCode == control.Operands[0])
                        {
                            branchTarget = control.Operands[1];
                            branched = true;
                        }
                        break;
                    case PalDialogueOpcode.BranchIfTeamIncomplete:
                        if (_state.TeamIncomplete)
                        {
                            branchTarget = control.Operands[0];
                            branched = true;
                        }
                        break;
                    case PalDialogueOpcode.BranchByRallyStage:
                        if (_state.RallyStage is >= 1 and <= 6)
                        {
                            branchTarget = control.Operands[_state.RallyStage - 1];
                            branched = branchTarget != 0;
                        }
                        break;
                    case PalDialogueOpcode.SetFlag:
                        _state.SetFlag(control.Operands[0], true);
                        break;
                    case PalDialogueOpcode.ClearFlag:
                        _state.SetFlag(control.Operands[0], false);
                        break;
                    case PalDialogueOpcode.SetRallyStage:
                        _state.RallyStage = control.Operands[0];
                        break;
                    case PalDialogueOpcode.WorldGrandPrixUnlockGate:
                        if (_state.WorldGrandPrixUnlocked)
                        {
                            branchTarget = control.Operands[0];
                            branched = true;
                        }
                        break;
                    case PalDialogueOpcode.BranchIfCurrentAreaEquals:
                        if (_state.CurrentAreaIndex == control.Operands[0])
                        {
                            branchTarget = control.Operands[1];
                            branched = true;
                        }
                        break;
                    default:
                        // Width/phase are known, but semantics are not yet proven. Keep
                        // the token visible to callers rather than inventing behaviour.
                        _ignoredControls.Add(control);
                        break;
                }

                if (branched)
                    break;
            }

            if (branched)
            {
                if (branchTarget == 0)
                {
                    IsEnded = true;
                    CurrentVariant = null;
                    return;
                }
                currentSlot = branchTarget;
                continue;
            }

            CurrentVariant = variant;
            return;
        }

        throw new InvalidDataException($"Dialogue entity '{_entity.Name}' exceeded the {SafetyLimit}-slot branch safety limit.");
    }
}
