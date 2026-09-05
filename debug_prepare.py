import asyncio,time
from pathlib import Path
from playwright.async_api import async_playwright
BUNDLE=Path('/mnt/data/rta_night_dev/web/sandbox-dist/rta-sandbox-capture.js').read_text()
CUE='/mnt/data/rta_game_extract/Road Trip Adventure (Europe) (En,Fr,De).cue'; BIN='/mnt/data/rta_game_extract/Road Trip Adventure (Europe) (En,Fr,De).bin'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=False, executable_path='/usr/bin/chromium', args=['--no-sandbox','--ignore-gpu-blocklist','--use-angle=gl'])
  page=await browser.new_page(viewport={'width':1400,'height':1100}); page.set_default_timeout(120000)
  page.on('pageerror',lambda e: print('ERR',e,flush=True)); page.on('console',lambda m: print('CON',m.type,m.text,flush=True) if m.type in ['error','warning'] else None)
  await page.evaluate("document.body.innerHTML='<input id=files type=file multiple>'"); await page.add_script_tag(content=BUNDLE); await page.set_input_files('#files',[CUE,BIN]); print('ready',flush=True)
  t=time.time(); r=await page.evaluate("""async()=>{const files=Array.from(document.querySelector('#files').files); return await window.__rtaSandboxCapture.prepareOutdoorFromBrowserFiles(files,false,[223]);}"""); print('prepared',time.time()-t,r,flush=True)
  await browser.close()
asyncio.run(main())
