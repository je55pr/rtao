import asyncio, base64, sys, time
from pathlib import Path
from playwright.async_api import async_playwright
SCENE=sys.argv[1]; FIELD=int(sys.argv[2]); OUT=Path(sys.argv[3])
BUNDLE=Path('/mnt/data/rta_night_dev/web/sandbox-dist/rta-sandbox-capture.js').read_text()
CUE='/mnt/data/rta_game_extract/Road Trip Adventure (Europe) (En,Fr,De).cue'; BIN='/mnt/data/rta_game_extract/Road Trip Adventure (Europe) (En,Fr,De).bin'
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=False, executable_path='/usr/bin/chromium', args=['--no-sandbox','--ignore-gpu-blocklist','--use-angle=gl'])
  page=await b.new_page(viewport={'width':1400,'height':1100}); page.set_default_timeout(120000)
  await page.evaluate("document.body.innerHTML='<input id=files type=file multiple>'"); await page.add_script_tag(content=BUNDLE); await page.set_input_files('#files',[CUE,BIN])
  await page.evaluate("""async f=>{const files=Array.from(document.querySelector('#files').files);return await window.__rtaSandboxCapture.prepareOutdoorFromBrowserFiles(files,false,[f]);}""",FIELD)
  data=await page.evaluate("""async s=>await window.__rtaSandboxCapture.capturePreparedOutdoorDataUrl(s)""",SCENE)
  OUT.parent.mkdir(parents=True,exist_ok=True); OUT.write_bytes(base64.b64decode(data.split(',',1)[1])); print('saved',OUT,OUT.stat().st_size,flush=True)
  await b.close()
asyncio.run(main())
