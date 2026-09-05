import asyncio, hashlib
from pathlib import Path
from playwright.async_api import async_playwright
BUNDLE=Path('/mnt/data/rta_src/web/sandbox-dist/rta-sandbox-capture.js').read_text()
CUE='/mnt/data/rta_game_extract/Road Trip Adventure (Europe) (En,Fr,De).cue'; BIN='/mnt/data/rta_game_extract/Road Trip Adventure (Europe) (En,Fr,De).bin'
OUT=Path('/mnt/data/rta_current_captures/qfactory.png')
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=False, executable_path='/usr/bin/chromium', args=['--no-sandbox','--ignore-gpu-blocklist','--use-angle=gl'])
  page=await b.new_page(viewport={'width':1400,'height':1100}); page.set_default_timeout(180000)
  page.on('pageerror',lambda e: print('ERR',e,flush=True)); page.on('console',lambda m: print('CON',m.type,m.text,flush=True) if m.type in ['error','warning'] else None)
  await page.evaluate("document.body.innerHTML='<input id=files type=file multiple>'"); await page.add_script_tag(content=BUNDLE); await page.set_input_files('#files',[CUE,BIN]); print('ready',flush=True)
  result=await page.evaluate("""async()=>{const files=Array.from(document.querySelector('#files').files);return await window.__rtaSandboxCapture.runCaptureFromBrowserFiles('qfactory',files,false)}""")
  png=bytes(result.pop('pngBytes')); OUT.write_bytes(png); print('saved',OUT,len(png),hashlib.sha256(png).hexdigest(),result,flush=True)
  await b.close()
asyncio.run(main())
