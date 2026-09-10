import { createHash } from "node:crypto";
import {
	closeSync,
	fstatSync,
	openSync,
	readSync,
	writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { Iso9660Disc } from "../../rtao/src/disc/iso9660";
import { RawMode2SectorSource } from "../../rtao/src/disc/randomAccess";
import {
	decodeIndexedTexture,
	readHg2Header,
	readCarMeshPart,
} from "../../rtao/src/formats/carGeometry";
import { readFieldHeader } from "../../rtao/src/formats/field";
import { readTextureUploads } from "../../rtao/src/formats/gsTextures";
import { readFieldObjectAsset } from "../../rtao/src/formats/fieldObjects";

const binPath = process.env.RTA_PAL_BIN;
const outputPath = process.env.DYNAMIC_OBJECT_CENSUS_OUTPUT;

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function round(value: number, places = 3): number {
	const scale = 10 ** places;
	return Math.round(value * scale) / scale;
}
async function openDisc() {
	if (!binPath) throw new Error("RTA_PAL_BIN is required for the PAL census.");
	const handle = openSync(binPath, "r");
	const raw = {
		size: fstatSync(handle).size,
		label: "local PAL BIN",
		async read(offset: number, length: number) {
			const bytes = new Uint8Array(length);
			if (readSync(handle, bytes, 0, length, offset) !== length)
				throw new Error("Short PAL BIN read.");
			return bytes;
		},
	};
	const disc = await Iso9660Disc.open(new RawMode2SectorSource(raw));
	return { disc, close: () => closeSync(handle) };
}

function sectionShape(slice: Uint8Array, sectionOffset: number) {
	try {
		const primitives = readCarMeshPart(slice, sectionOffset + 0x10);
		if (primitives.length === 0) return { kind: "non-mesh" as const };
		const vertices = primitives.reduce(
			(sum, primitive) => sum + primitive.vertices.length,
			0,
		);
		let radiusSquared = 0;
		for (const primitive of primitives) {
			for (const vertex of primitive.vertices) {
				const [x, y, z] = vertex.position;
				radiusSquared = Math.max(radiusSquared, x * x + y * y + z * z);
			}
		}
		return {
			kind: "mesh" as const,
			primitiveCount: primitives.length,
			vertices,
			stripTriangles: primitives.reduce(
				(sum, primitive) => sum + Math.max(0, primitive.vertices.length - 2),
				0,
			),
			vuPrograms: [
				...new Set(primitives.map((primitive) => primitive.vuProgram)),
			].sort((a, b) => a - b),
			radius: round(Math.sqrt(radiusSquared)),
		};
	} catch {
		return { kind: "non-mesh" as const };
	}
}

function summarizeExtra(slice: Uint8Array, index: number) {
	let sections: ReturnType<typeof sectionShape>[] = [];
	let sectionCount: number | null = null;
	let offsets: number[] = [];
	let texture: { width: number; height: number; transparency: boolean } | null =
		null;
	try {
		const hg2 = readHg2Header(slice);
		offsets = hg2.offsets;
		sectionCount = offsets.length - 1;
		sections = offsets
			.slice(0, -1)
			.map((offset) => sectionShape(slice, offset));
		for (
			let sectionIndex = 0;
			sectionIndex < sections.length && !texture;
			sectionIndex += 1
		) {
			if (sections[sectionIndex]?.kind === "mesh") continue;
			try {
				const sectionOffset = offsets[sectionIndex];
				const nextOffset = offsets[sectionIndex + 1];
				if (sectionOffset === undefined || nextOffset === undefined) continue;
				const uploads = readTextureUploads(
					slice,
					sectionOffset,
					nextOffset - sectionOffset,
				);
				const decoded = decodeIndexedTexture(uploads, 8);
				texture = {
					width: decoded.width,
					height: decoded.height,
					transparency: decoded.hasTransparency,
				};
			} catch {
				// Not every non-mesh section is a PSMT8 object texture.
			}
		}
	} catch {
		// A field extra is not necessarily an HG2 object container.
	}
	const meshes = sections.filter((section) => section.kind === "mesh");
	const radius =
		meshes.length === 0
			? null
			: Math.max(
					...meshes.map((section) =>
						section.kind === "mesh" ? section.radius : 0,
					),
				);
	return {
		index,
		bytes: slice.byteLength,
		sha256: sha256(slice),
		hg2: sectionCount !== null,
		sectionCount,
		sections,
		radius,
		texture,
		structuralKey:
			meshes.length === 0
				? null
				: meshes
						.map((section) =>
							section.kind === "mesh"
								? `${section.primitiveCount}p/${section.vertices}v/${section.stripTriangles}t/vu${section.vuPrograms.join("+")}`
								: "x",
						)
						.join("|"),
	};
}
describe.skipIf(!binPath)("PAL FLD dynamic/extra object census", () => {
	test("censuses every ordinary FLD sector without retaining game payloads", async () => {
		const { disc, close } = await openDisc();
		try {
			const entries = (await disc.listDirectory("FLD"))
				.filter(
					(entry) =>
						!entry.directory && /^\d{3}\.BIN$/.test(entry.normalizedName),
				)
				.sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
			expect(entries).toHaveLength(64);

			const fields = [] as Record<string, unknown>[];
			for (const entry of entries) {
				const fieldNumber = Number.parseInt(
					entry.normalizedName.slice(0, 3),
					10,
				);
				const bytes = await disc.readFile(`FLD/${entry.normalizedName}`);
				const header = readFieldHeader(bytes);
				const extraSections = header.extras.map((section) =>
					summarizeExtra(
						bytes.subarray(section.offset, section.offset + section.length),
						section.extraIndex,
					),
				);
				const extra1 = header.extras[1];
				if (!extra1) {
					fields.push({
						fieldNumber,
						fileBytes: bytes.byteLength,
						extraCount: header.extras.length,
						extraSections,
						extra1: null,
					});
					continue;
				}

				const slice = bytes.subarray(
					extra1.offset,
					extra1.offset + extra1.length,
				);
				let containerOffsets: number[] | null = null;
				let sections: ReturnType<typeof sectionShape>[] = [];
				try {
					const hg2 = readHg2Header(slice);
					containerOffsets = hg2.offsets;
					sections = hg2.offsets
						.slice(0, -1)
						.map((offset) => sectionShape(slice, offset));
				} catch {
					// Retain the existence/hash/length only. Invalid-as-HG2 is itself a fact.
				}
				const asset = readFieldObjectAsset(bytes);
				const meshSections = sections.filter(
					(section) => section.kind === "mesh",
				);
				const structuralKey =
					meshSections.length === 0
						? null
						: meshSections
								.map((section) => {
									if (section.kind !== "mesh") return "x";
									return `${section.primitiveCount}p/${section.vertices}v/${section.stripTriangles}t/vu${section.vuPrograms.join("+")}`;
								})
								.join("|");

				fields.push({
					fieldNumber,
					fileBytes: bytes.byteLength,
					extraCount: header.extras.length,
					extraSections,
					extra1: {
						bytes: extra1.length,
						sha256: sha256(slice),
						hg2: containerOffsets !== null,
						sectionCount: containerOffsets ? containerOffsets.length - 1 : null,
						sections,
						structuralKey,
						decodedKind: asset?.kind ?? null,
						decodedMeshCount: asset?.meshes.length ?? 0,
						decodedRadius: asset ? round(asset.radius) : null,
						texture: asset?.texture
							? {
									width: asset.texture.width,
									height: asset.texture.height,
									transparency: asset.texture.hasTransparency,
								}
							: null,
					},
				});
			}
			const populated = fields.filter((field) => field.extra1 !== null);
			const decoded = populated.filter(
				(field) =>
					(field.extra1 as { decodedMeshCount?: number }).decodedMeshCount,
			);
			const allMeshExtras: {
				fieldNumber: number;
				index: number;
				sha256: string;
				structuralKey: string;
			}[] = [];
			for (const field of fields) {
				const fieldNumber = field.fieldNumber as number;
				const extras = field.extraSections as ReturnType<
					typeof summarizeExtra
				>[];
				for (const extra of extras) {
					if (extra.structuralKey)
						allMeshExtras.push({
							fieldNumber,
							index: extra.index,
							sha256: extra.sha256,
							structuralKey: extra.structuralKey,
						});
				}
			}
			const byHash = new Map<string, string[]>();
			const byStructure = new Map<string, string[]>();
			for (const extra of allMeshExtras) {
				const member = `${String(extra.fieldNumber).padStart(3, "0")}:${extra.index}`;
				const hashMembers = byHash.get(extra.sha256) ?? [];
				hashMembers.push(member);
				byHash.set(extra.sha256, hashMembers);
				const structureMembers = byStructure.get(extra.structuralKey) ?? [];
				structureMembers.push(member);
				byStructure.set(extra.structuralKey, structureMembers);
			}

			const report = {
				schema: 1,
				authority: {
					discLabel:
						"European PAL Road Trip Adventure / ChoroQ HG 2 MODE2/2352 image",
					executable: "SLES_513.56",
					executableSha256: sha256(await disc.readFile("SLES_513.56")),
				},
				scope: {
					ordinaryFieldCount: fields.length,
					fieldDirectory: "FLD",
					payloadRetained: false,
				},
				summary: {
					fieldsWithExtra1: populated.length,
					fieldsWithDecodedExtra1MscalfObject: decoded.length,
					mscalfMeshExtraCount: allMeshExtras.length,
					fieldsWithAnyMscalfMeshExtra: new Set(
						allMeshExtras.map((extra) => extra.fieldNumber),
					).size,
					nonExtra1MscalfMeshExtras: allMeshExtras
						.filter((extra) => extra.index !== 1)
						.map((extra) => ({
							fieldNumber: extra.fieldNumber,
							index: extra.index,
						})),
					exactObjectFamilies: [...byHash.values()].filter(
						(members) => members.length > 1,
					),
					repeatedStructuralFamilies: [...byStructure.values()].filter(
						(members) => members.length > 1,
					),
				},
				fields,
			};
			if (outputPath) {
				const destination = resolve(outputPath);
				writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
				console.log(`dynamic-object census: ${destination}`);
			} else {
				console.log(JSON.stringify(report, null, 2));
			}

			expect(fields.map((field) => field.fieldNumber)).toEqual(
				[...fields.map((field) => field.fieldNumber as number)].sort(
					(a, b) => a - b,
				),
			);
			expect(
				fields.find((field) => field.fieldNumber === 213)?.extra1,
			).not.toBeNull();
			expect(
				fields.find((field) => field.fieldNumber === 220)?.extra1,
			).not.toBeNull();
			expect(
				fields.find((field) => field.fieldNumber === 221)?.extra1,
			).not.toBeNull();
			expect(allMeshExtras).toHaveLength(13);
			expect(
				allMeshExtras
					.filter((extra) => extra.index !== 1)
					.map(({ fieldNumber, index }) => ({ fieldNumber, index })),
			).toEqual([{ fieldNumber: 23, index: 79 }]);
			const myCityExtraSections = fields.find(
				(field) => field.fieldNumber === 23,
			)?.extraSections;
			const myCityExtra79 = Array.isArray(myCityExtraSections)
				? (myCityExtraSections as ReturnType<typeof summarizeExtra>[])[79]
				: undefined;
			expect(myCityExtra79?.structuralKey).toBe(
				"30p/396v/336t/vu4|31p/194v/132t/vu4|259p/1342v/824t/vu4",
			);
			expect(myCityExtra79?.texture).toMatchObject({
				width: 128,
				height: 128,
				transparency: true,
			});
			expect(
				[...byStructure.values()].filter((members) => members.length > 1),
			).toEqual([["220:1", "221:1"]]);
		} finally {
			close();
		}
	});
});
