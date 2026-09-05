import asyncio, base64, hashlib, json, time
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path('/mnt/data/rta_src/web')
BUNDLE=(ROOT/'sandbox-dist/rta-sandbox-capture.js').read_text()
GAME=Path('/mnt/data/rta_game_extract')
CUE=str(GAME/'Road Trip Adventure (Europe) (En,Fr,De).cue')
BIN=str(GAME/'Road Trip Adventure (Europe) (En,Fr,De).bin')
OUT=Path('/mnt/data/rta_current_captures'); OUT.mkdir(exist_ok=True)
SCENES=[
 'peach-day-ground','peach-night-ground','peach-night-ground-extended','peach-sunset-ground',
 'fuji-day-ground','fuji-night-ground','fuji-night-ground-extended',
 'bridge-day','bridge-night'
]

async def main():
  async with async_playwright() as p:
    browser=await p.chromium.launch(headless=False, executable_path='/usr/bin/chromium', args=['--no-sandbox','--ignore-gpu-blocklist','--use-angle=gl'])
    page=await browser.new_page(viewport={'width':1400,'height':1100})
    page.set_default_timeout(900000)
    page.on('console', lambda m: print('console:',m.type,m.text,flush=True) if m.type in ['error','warning'] else None)
    page.on('pageerror', lambda e: print('pageerror:',e,flush=True))
    await page.evaluate("document.body.innerHTML='<input id=files type=file multiple>'; ")
    await page.add_script_tag(content=BUNDLE)
    await page.set_input_files('#files',[CUE,BIN])
    print('preparing FLD/223, 113, 220...', flush=True)
    t=time.time()
    info=await page.evaluate("""async () => {
      const files=Array.from(document.querySelector('#files').files);
      return await window.__rtaSandboxCapture.prepareOutdoorFromBrowserFiles(files,false,[223,113,220]);
    }""")
    print('prepared', time.time()-t, info, flush=True)
    summary={'prepared':info,'scenes':{}}
    for scene in SCENES:
      print('capture',scene,flush=True)
      t=time.time()
      data=await page.evaluate("""async s=>await window.__rtaSandboxCapture.capturePreparedOutdoorDataUrl(s)""",scene)
      png=base64.b64decode(data.split(',',1)[1])
      sha=hashlib.sha256(png).hexdigest()
      (OUT/f'{scene}.png').write_bytes(png)
      summary['scenes'][scene]={'sha256':sha,'bytes':len(png),'seconds':time.time()-t}
      print(scene, sha, len(png), f"{time.time()-t:.2f}s", flush=True)
    await page.evaluate("window.__rtaSandboxCapture.disposePreparedOutdoor()")
    print('capture qfactory', flush=True)
    result=await page.evaluate("""async () => {
      const files=Array.from(document.querySelector('#files').files);
      return await window.__rtaSandboxCapture.runCaptureFromBrowserFiles('qfactory',files,false);
    }""")
    png=bytes(result.pop('pngBytes'))
    sha=hashlib.sha256(png).hexdigest()
    (OUT/'qfactory.png').write_bytes(png)
    summary['scenes']['qfactory']={'sha256':sha,'bytes':len(png),'meta':result}
    (OUT/'summary.json').write_text(json.dumps(summary,indent=2))
    await browser.close()

asyncio.run(main())
