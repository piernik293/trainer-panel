---
name: Pointerdown selection double-toggle
description: Handling selection in onPointerDown (for drag-paint) requires suppressing the browser's follow-up click event.
---

Rule: when a grid implements mouse drag-paint selection by toggling state in `onPointerDown`, the browser still fires a `click` afterwards — if `onClick` also toggles, the item flips right back off and selection appears completely dead.

**Why:** hit this in the trainer calendar bulk-edit mode; symptom was "clicks do nothing" (toggle-on + toggle-off in the same gesture), with zero console errors.

**How to apply:** set a `suppressClickRef` in the mouse `pointerdown` handler and consume/reset it at the top of `onClick`. Keep `onClick` as the only path for keyboard (Enter/Space) and touch (pointerType !== "mouse"), so taps and keyboard still work and touch scrolling stays free. Note: synthetic `dispatchEvent(new PointerEvent(...))` in tests won't reproduce real-mouse behavior — verify with real input.
