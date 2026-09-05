import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
BUNDLE=Path('/mnt/data/rta_night_dev/web/sandbox-dist/rta-sandbox-capture.js').read_text(); print('bundle',len(BUNDLE),flush=True)
CUE='/mnt/data/rta_game_extract/Road Trip Adventure (Europe) (En,Fr,De).cue'; BIN='/mnt/data/rta_game_extract/Road Trip Adventure (Europe) (En,Fr,De).bin'
async def main():
 async with async_playwright() as p:
  print('launch',flush=True)
  browser=await p.chromium.launch(headless=False, executable_path='/usr/bin/chromium', args=['--no-sandbox','--ignore-gpu-blocklist','--use-angle=gl']); print('launched',flush=True)
  page=await browser.new_page(viewport={'width':1400,'height':1100}); print('page',flush=True)
  await page.evaluate("document.body.innerHTML='<input id=files type=file multiple>'"); print('html',flush=True)
  await page.add_script_tag(content=BUNDLE); print('script',flush=True)
  await page.set_input_files('#files',[CUE,BIN]); print('files',flush=True)
  print(await page.evaluate("typeof window.__rtaSandboxCapture"),flush=True)
  await browser.close()
asyncio.run(main())
