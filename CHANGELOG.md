#2.0.0

  * compare with one YIQ tolerance (default 16) instead of a separate limit per channel
  * count only the real overlap, and count pixels that exist in only one image as a mismatch
  * drop the large-image row skip so those pixels are no longer treated as matches
  * ignore fully transparent pixels, and keep ignored rectangles out of the mismatch percentage
  * detect PNG and JPEG from the file signature, and report `diffBounds`
  * the People.png fixture mismatch is 13.17% (was 8.66%). The old per-channel limit of 16 treated a visible colour shift as equal when each channel moved by less than 16. YIQ now counts that shift.

#1.2.0

  * updated jpeg-js and pngjs dependencies
  * updated credits README.md

#0.2.0

  * added support for jpeg

#0.1.0

  * wrong release - kept back

#0.0.4

  * rename package name to node-resemble-js

#0.0.3

  * added ignoreRectangles feature

<a name="0.0.0"></a>
#0.0.0
  * initial commit (started form resemble sha 5ce379b)
  * rewrite resence to node.js (with only pngjs dependency)
  * added example
