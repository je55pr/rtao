import asyncio, os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent
BUNDLE=ROOT/'web'/'sandbox-dist'/'rta-sandbox-capture.js'
GAME=Path(os.environ['RTA_GAME_DIR'])
CUE=GAME/'Road Trip Adventure (Europe) (En,Fr,De).cue'; BIN=GAME/'Road Trip Adventure (Europe) (En,Fr,De).bin'
BROWSER=os.environ['RTA_CHROMIUM_EXECUTABLE']
async def main():
    base=0x00100000; length=0x220000; out=bytearray()
    async with async_playwright() as p:
      browser=await p.chromium.launch(headless=False, executable_path=BROWSER,args=['--no-sandbox','--ignore-gpu-blocklist','--use-angle=gl'])
      page=await browser.new_page(viewport={'width':800,'height':600}); page.set_default_timeout(180000)
      await page.evaluate("document.body.innerHTML='<input id=files type=file multiple>'")
      await page.add_script_tag(content=BUNDLE.read_text())
      await page.set_input_files('#files',[str(CUE),str(BIN)])
      for pos in range(0,length,65536):
        n=min(65536,length-pos)
        try:
          vals=await page.evaluate("async ([a,n])=>window.__rtaSandboxCapture.inspectExecutableVirtualBytes(a,n,Array.from(document.querySelector('#files').files))",[base+pos,n])
        except Exception as e:
          print('FAIL',hex(base+pos),n,e); raise
        out.extend(vals); print(hex(base+pos),n)
      await browser.close()
    Path('/mnt/data/rta_big_tyre/SLES_513.56.bin').write_bytes(out)
    print('saved',len(out))
asyncio.run(main())
