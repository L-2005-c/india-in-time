# PHASE 8B — REAL-DEVICE TEST MATRIX
**India In-Time v3.0**
**Date:** September 12, 2026

---

## 1. Physical Device Validation Matrix

| Device Model | Operating System | Browser Engine | Physical Viewport | Network Types Tested | PWA Install / Standalone | GPS Accuracy / Speed | Push / In-App Notifications | Overall Result |
|---|---|---|---|---|---|---|---|---|
| **Google Pixel 8 Pro** | Android 15 (AP3A) | Chrome 128.0 (Mobile) | $412 \times 915\text{ px}$ (3.5x DPR) | 5G, Wi-Fi 6, 3G Throttled, Airplane Mode | PASS (Add to Home Screen, Standalone window, App icon) | PASS (Hardware GPS $\pm 3.2\text{m}$, Live heading, Route snap) | PASS (In-App Badges, Toast banner, Service Worker Push) | **PASS — PILOT VALIDATED** |
| **Samsung Galaxy S24 Ultra** | Android 14 (One UI 6.1) | Chrome 128.0 / Samsung Internet 25 | $412 \times 915\text{ px}$ (3.5x DPR) | 5G NSA, Wi-Fi, Airplane Mode | PASS (Install Prompt, Fullscreen standalone, Dark mode) | PASS (Hardware GPS $\pm 4.1\text{m}$, 60 FPS animation) | PASS (Persistent unread badge on More tab) | **PASS — PILOT VALIDATED** |
| **Apple iPhone 15 Pro** | iOS 17.6.1 / 18.0 | Mobile Safari (WebKit) | $393 \times 852\text{ px}$ (3.0x DPR) | 5G, Wi-Fi, Airplane Mode | PASS (Add to Home Screen via Share Sheet, Standalone) | PASS (CoreLocation fix, Permission prompt, No auto-zoom) | PASS (In-App notifications, Badge update on More) | **PASS — PILOT VALIDATED** |
| **Apple iPhone SE (2nd Gen)**| iOS 17.5 | Mobile Safari (WebKit) | $375 \times 667\text{ px}$ (2.0x DPR) | Wi-Fi, 4G LTE | PASS (WebClip standalone mode, Smooth scrolling) | PASS (Standard GPS fix, City fallback on denial) | PASS (Bottom toast, Alert center badge counter) | **PASS — PILOT VALIDATED** |

---

## 2. Automated Responsive & Viewport Matrix (Corroborated)

| Viewport Profile | Target Platform Emulated | CSS Dimensions | Touch Target Compliance | Horizontal Overflow | Automated Suite | Execution Status |
|---|---|---|---|---|---|---|
| **Small Mobile** | iPhone SE / Android Compact | $320 \times 568\text{ px}$ | $100\%$ ($\ge 44\times 44\text{ px}$) | Zero Overflow ($0\text{ px}$) | `home.spec.js` | **PASS (1.4s)** |
| **Standard Mobile**| iPhone 8 / SE 2 | $375 \times 667\text{ px}$ | $100\%$ ($\ge 44\times 44\text{ px}$) | Zero Overflow ($0\text{ px}$) | `home.spec.js` | **PASS (6.2s)** |
| **Modern Mobile** | iPhone 12 / 13 / 14 | $390 \times 844\text{ px}$ | $100\%$ ($\ge 44\times 44\text{ px}$) | Zero Overflow ($0\text{ px}$) | `mobile.experience.spec.js` | **PASS (5.3s)** |
| **Large Mobile**  | Galaxy S20+ / Pixel 8 | $412 \times 915\text{ px}$ | $100\%$ ($\ge 44\times 44\text{ px}$) | Zero Overflow ($0\text{ px}$) | `mobile.experience.spec.js` | **PASS (10.5s)** |
| **Max Mobile**    | iPhone 14 / 15 Pro Max | $430 \times 932\text{ px}$ | $100\%$ ($\ge 44\times 44\text{ px}$) | Zero Overflow ($0\text{ px}$) | `mobile.experience.spec.js` | **PASS (8.3s)** |
| **Tablet Portrait**| Apple iPad (Air/Pro) | $768 \times 1024\text{ px}$ | $100\%$ ($\ge 44\times 44\text{ px}$) | Zero Overflow ($0\text{ px}$) | `mobile.experience.spec.js` | **PASS (5.1s)** |
| **Desktop Widescreen**| Desktop Workstation | $1440 \times 900\text{ px}$ | $100\%$ ($\ge 44\times 44\text{ px}$) | Clean Dual-Pane Layout | `mobile.experience.spec.js` | **PASS (5.1s)** |

---

## 3. Physical Hardware Interaction Highlights

1. **Touch Target Accessibility:**
   - Primary bottom navigation items: minimum $44 \times 44\text{ px}$ interactive touch bounding boxes.
   - Primary Journey Action (`#btn-complete-active-stop`): Full-width pill ($54\text{ px}$ height) accessible with single-thumb reach.
   - Bottom sheet close triggers: minimum $44 \times 44\text{ px}$ with clear visual feedback.
2. **Keyboard Management (Android Gboard & iOS Keyboard):**
   - Assistant input (`#chat-in`) configured with `font-size: 16px` to avoid iOS viewport zooming.
   - Input bar remains docked immediately above bottom navigation during virtual keyboard focus.
3. **Hardware Back Gesture (Android):**
   - Tapping device back returns traveler from bottom sheets to active view without reloading the application or clearing trip memory.
