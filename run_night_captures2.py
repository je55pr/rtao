import asyncio, hashlib, json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path('/mnt/data/rta_night_dev/web')
BUNDLE=(ROOT/'sandbox-dist/rta-sandbox-capture.js').read_text()
CUE='/mnt/data/rta_game_extract/Road Trip Adventure (Europe) (En,Fr,De).cue'
BIN='/mnt/data/rta_game_extract/Road Trip Adventure (Europe) (En,Fr,De).bin'
OUT=Path('/mnt/data/rta_night_visibility_captures2'); OUT.mkdir(exist_ok=True)
ARGS=['--no-sandbox','--ignore-gpu-blocklist','--use-angle=gl']
SCENES=[
 ('peach-night-ground',[223]),
 ('peach-sunset-ground',[223]),
 ('fuji-night-ground',[113]),
 ('bridge-night',[220]),
]

async def main():
  async with async_playwright() as p:
    browser=await p.chromium.launch(headless=False, executable_path='/usr/bin/chromium', args=ARGS)
    page=await browser.new_page(viewport={'width':1400,'height':1100})
    page.set_default_timeout(900000)
    page.on('console', lambda m: print('console:',m.type,m.text) if m.type in ['error','warning'] else None)
    page.on('pageerror', lambda e: print('pageerror:',e))
    await page.evaluate("document.body.innerHTML='<input id=files type=file multiple>'; ")
    await page.add_script_tag(content=BUNDLE)
    await page.set_input_files('#files',[CUE,BIN])
    for scene,fields in SCENES:
      print('capture',scene, flush=True)
      result=await page.evaluate("""async ({scene,fields}) => {
        const files=Array.from(document.querySelector('#files').files);
        await window.__rtaSandboxCapture.prepareOutdoorFromBrowserFiles(files,false,fields);
        try { return await window.__rtaSandboxCapture.capturePreparedOutdoor(scene); }
        finally { window.__rtaSandboxCapture.disposePreparedOutdoor(); }
      }""", {'scene':scene,'fields':fields})
      png=bytes(result['pngBytes'])
      (OUT/f'{scene}.png').write_bytes(png)
      meta={k:v for k,v in result.items() if k!='pngBytes'}; meta['sha256Local']=hashlib.sha256(png).hexdigest()
      (OUT/f'{scene}.json').write_text(json.dumps(meta,indent=2))
      print(scene,meta['sha256Local'],len(png),flush=True)
    await browser.close()

asyncio.run(main())
