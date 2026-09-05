import asyncio, hashlib
from pathlib import Path
from playwright.async_api import async_playwright
BUNDLE=Path('/mnt/data/rta_night_dev/web/sandbox-dist/rta-sandbox-capture.js').read_text()
CUE='/mnt/data/rta_game_extract/Road Trip Adventure (Europe) (En,Fr,De).cue'; BIN='/mnt/data/rta_game_extract/Road Trip Adventure (Europe) (En,Fr,De).bin'
SCENE='peach-night-ground'; FIELD=223; OUT=Path('/mnt/data/rta_night_visibility_captures')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=False, executable_path='/usr/bin/chromium', args=['--no-sandbox','--ignore-gpu-blocklist','--use-angle=gl'])
  page=await browser.new_page(viewport={'width':1400,'height':1100}); page.set_default_timeout(120000)
  page.on('pageerror',lambda e: print('PAGEERR',e,flush=True)); page.on('console',lambda m: print('CON',m.type,m.text,flush=True) if m.type=='error' else None)
  await page.evaluate("document.body.innerHTML='<input id=files type=file multiple>'")
  await page.add_script_tag(content=BUNDLE)
  await page.set_input_files('#files',[CUE,BIN]); print('files',flush=True)
  result=await page.evaluate("""async ({scene,field})=>{const files=Array.from(document.querySelector('#files').files);await window.__rtaSandboxCapture.prepareOutdoorFromBrowserFiles(files,false,[field]);try{return await window.__rtaSandboxCapture.capturePreparedOutdoor(scene);}finally{window.__rtaSandboxCapture.disposePreparedOutdoor();}}""",{'scene':SCENE,'field':FIELD})
  png=bytes(result['pngBytes']); (OUT/f'{SCENE}.png').write_bytes(png); print('DONE',len(png),hashlib.sha256(png).hexdigest(),flush=True); await browser.close()
asyncio.run(main())
