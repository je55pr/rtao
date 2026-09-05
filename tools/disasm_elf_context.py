import struct,sys
from pathlib import Path
from mips_probe import disassemble
b=Path('/mnt/data/rta_big_tyre/SLES_513.56').read_bytes()
segs=[]
phoff=struct.unpack_from('<I',b,0x1c)[0]; ents=struct.unpack_from('<H',b,0x2a)[0]; n=struct.unpack_from('<H',b,0x2c)[0]
for i in range(n):
 o=phoff+i*ents; p=struct.unpack_from('<8I',b,o)
 if p[0]==1: segs.append((p[2],p[1],p[4]))
def word(addr):
 for va,fo,sz in segs:
  if va<=addr<va+sz-3: return struct.unpack_from('<I',b,fo+addr-va)[0]
 raise KeyError(addr)
for s in sys.argv[1:]:
 a=int(s,0); print('\n###',hex(a))
 for addr in range(a-0x50,a+0x54,4):
  try:w=word(addr)
  except:continue
  mark='>>' if addr==a else '  '
  print(f'{mark}{addr:08x}: {w:08x}  {disassemble(w,addr)}')
