# White Mountain Bunger deterministic baseline refresh — 2026-09-01

The full twenty-room run after adding Quick-Pic stopped only at White Mountain Bunger: two current captures were byte-identical but produced 2,820,028 bytes and SHA-256 `b6c78603297dec38934ac1dd071eb3cfb0fcb4b7b2188491f83372af2426853c`, rather than the older recorded 2,820,086-byte hash.

This was isolated before changing the baseline. The immediately pre-Paint `RTA_ThreeJS_native_equipment_catalogue_bridge_2026-09-01.zip` checkpoint was extracted separately, its original capture bundle rebuilt, and Bunger recaptured with the same PAL source and Chrome 151 executable. That old source independently produced the same 2,820,028-byte current hash. Thus the difference does not originate in Quick-Pic, Paint Shop live-body rebuilding or current room-render source.

Visual inspection of the current 1280×960 frame passed: the Christmas-tree room, window, picture, floor, live green player car and pink staff car are visible and coherently staged with no blank or catastrophic output. The current hash was reproduced across separate browser processes and within each run's required double capture.

The regression baseline is therefore refreshed to the reproducible current value. The former hash remains preserved in older handoffs and historical research notes.
