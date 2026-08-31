/**
 * The picture of the sample home.
 *
 * Drawn rather than photographed, and deliberately so: Marsh Point is a
 * fictional house, and a real photograph of a real building standing in for it
 * would be a small lie in a product whose whole claim is that its record is
 * true. An illustration reads as an illustration.
 *
 * An inline SVG data URI rather than a bundled file, because `photoUri` holds a
 * URI and the sample record has to be constructible without touching the asset
 * pipeline — `buildSampleRecord` runs in unit tests too. It is a couple of
 * kilobytes, which is less than a JPEG of the same thing would be.
 *
 * Percent-encoded rather than base64 so it stays legible in a diff: changing
 * the roofline should be a readable edit, not a new blob.
 */
/*
 * Composed for a thumbnail first.
 *
 * It is drawn 4:3 but almost always shown in a square, so the crop takes a
 * third of the width away — and at 56 points a house sitting politely in a
 * landscape is a smudge. The building therefore fills the frame, everything
 * that carries the picture stays inside the middle 300 units, and the detail
 * that survives is silhouette and the two lit windows.
 */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#162435"/>
      <stop offset="1" stop-color="#51637A"/>
    </linearGradient>
    <linearGradient id="marsh" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#77835F"/>
      <stop offset="1" stop-color="#4C5738"/>
    </linearGradient>
  </defs>

  <rect width="400" height="300" fill="url(#sky)"/>
  <circle cx="320" cy="56" r="22" fill="#E8C98C" opacity="0.5"/>

  <!-- The marsh, which is the whole reason this house stands on piers. -->
  <path d="M0 224 Q 110 214 210 221 T 400 214 L400 300 L0 300 Z" fill="url(#marsh)"/>

  <!-- Piers first, so the house sits on them rather than in front of them. -->
  <g fill="#1E2E42">
    <rect x="112" y="206" width="11" height="44"/>
    <rect x="194" y="206" width="11" height="44"/>
    <rect x="277" y="206" width="11" height="44"/>
  </g>

  <rect x="98" y="122" width="204" height="86" fill="#F2EFE7"/>
  <rect x="94" y="204" width="212" height="8" fill="#D8D2C2"/>

  <!--
    Standing-seam metal: the roof every house on this creek ends up with.
    Pitched shallower than it wants to be, and lighter than the sky behind it,
    so the ridge still reads as a roofline at 56 points against a dark ground.
  -->
  <path d="M78 124 L200 62 L322 124 Z" fill="#33485F"/>
  <g stroke="#5A7189" stroke-width="2">
    <path d="M126 100 L126 124"/><path d="M158 84 L158 124"/>
    <path d="M242 84 L242 124"/><path d="M274 100 L274 124"/>
  </g>

  <!-- Porch: posts, rail, the door, and two windows with the lights on. -->
  <g fill="#E8B45C">
    <rect x="126" y="140" width="34" height="30" rx="2"/>
    <rect x="240" y="140" width="34" height="30" rx="2"/>
  </g>
  <rect x="181" y="138" width="38" height="70" rx="2" fill="#6F7B5F"/>
  <circle cx="211" cy="174" r="3" fill="#E8C98C"/>
  <rect x="94" y="180" width="212" height="4" fill="#DCD7C9"/>
  <g fill="#E5E0D4">
    <rect x="100" y="130" width="6" height="78"/>
    <rect x="197" y="130" width="6" height="78"/>
    <rect x="294" y="130" width="6" height="78"/>
  </g>

  <!-- Spartina at the waterline. Enough to read as marsh, not as a lawn. -->
  <g stroke="#3E4A2C" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.75">
    <path d="M64 262 Q 60 244 66 232"/><path d="M76 264 Q 78 246 88 236"/>
    <path d="M330 258 Q 334 240 328 228"/><path d="M344 262 Q 340 244 350 234"/>
  </g>
</svg>`;

export const SAMPLE_HOME_PHOTO = `data:image/svg+xml,${encodeURIComponent(
  SVG.replace(/\s+/g, ' ').trim(),
)}`;
