---
id: "01"
url: /cart
selector: null
selector_strategy: null
selector_unique: null
mode: fullpage
element_text: null
dom_path: null
screen: null
viewport: 0x0
screenshot: 01-discount-is-lost-after-navigating-cart.png
errors_count: 0
actions_count: 6
recording: true
frames_count: 3
frames_dir: 01-discount-is-lost-after-navigating-cart-frames
created_at: 2026-07-22T19:07:37Z
---

Discount is lost after navigating cart → checkout → cart

## Actions
- [3m before report] click #apply ("Apply") — frame 02
- [2m before report] click #to-checkout ("Checkout") — frame 03
- [2m before report] navigate /evidence/record-harness.html → /checkout
- [2m before report] click #to-cart ("Cart")
- [2m before report] navigate /checkout → /cart
- [2m before report] type (6 chars) #code
