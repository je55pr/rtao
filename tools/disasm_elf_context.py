#!/usr/bin/env python3
from pathlib import Path
import sys

from elf_archaeology import AddressSpace
from mips_probe import disassemble

if len(sys.argv) < 3:
    raise SystemExit("usage: disasm_elf_context.py <ELF> <address> [address ...]")

space = AddressSpace.from_input(Path(sys.argv[1]).read_bytes())

for text in sys.argv[2:]:
    target = int(text, 0)
    print(f"\n### {target:#010x}")
    for address in range(target - 0x50, target + 0x54, 4):
        try:
            word = space.u32(address)
        except ValueError:
            continue
        mark = ">>" if address == target else "  "
        print(f"{mark}{address:08x}: {word:08x}  {disassemble(word, address)}")
