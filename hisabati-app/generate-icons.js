/**
 * Icon Generator for حساباتي
 * Run: node generate-icons.js
 * Requires: npm install sharp
 *
 * Place your base icon (1024x1024 PNG) as: assets/icon-base.png
 * It generates all required sizes for iOS + Android + PWA
 */

const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const SOURCE = path.join(__dirname, 'assets', 'icon-base.png')
const ICONS_DIR = path.join(__dirname, 'public', 'icons')
const SPLASH_DIR = path.join(__dirname, 'public', 'splash')

// Ensure directories exist
fs.mkdirSync(ICONS_DIR, { recursive: true })
fs.mkdirSync(SPLASH_DIR, { recursive: true })

// PWA + Android icon sizes
const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512]

// iOS App Store & Splash sizes
const IOS_ICONS = [
  { size: 20,  scale: 1 },
  { size: 20,  scale: 2 },
  { size: 20,  scale: 3 },
  { size: 29,  scale: 1 },
  { size: 29,  scale: 2 },
  { size: 29,  scale: 3 },
  { size: 40,  scale: 1 },
  { size: 40,  scale: 2 },
  { size: 40,  scale: 3 },
  { size: 60,  scale: 2 },
  { size: 60,  scale: 3 },
  { size: 76,  scale: 1 },
  { size: 76,  scale: 2 },
  { size: 83.5,scale: 2 },
  { size: 1024,scale: 1 }, // App Store
]

// Splash screens
const SPLASH_SIZES = [
  { width: 2048, height: 2732, name: 'splash-2048x2732.png' }, // iPad Pro 12.9"
  { width: 1668, height: 2388, name: 'splash-1668x2388.png' }, // iPad Pro 11"
  { width: 1536, height: 2048, name: 'splash-1536x2048.png' }, // iPad Air
  { width: 1290, height: 2796, name: 'splash-1290x2796.png' }, // iPhone 14 Pro Max
  { width: 1179, height: 2556, name: 'splash-1179x2556.png' }, // iPhone 14 Pro
  { width: 1284, height: 2778, name: 'splash-1284x2778.png' }, // iPhone 14 Plus
  { width: 1170, height: 2532, name: 'splash-1170x2532.png' }, // iPhone 12/13
  { width: 1125, height: 2436, name: 'splash-1125x2436.png' }, // iPhone X/XS
  { width: 750,  height: 1334, name: 'splash-750x1334.png'  }, // iPhone SE
]

async function generate() {
  if (!fs.existsSync(SOURCE)) {
    console.error('❌ Place your 1024x1024 icon at: assets/icon-base.png')
    process.exit(1)
  }

  console.log('📱 Generating icons...')

  // PWA/Android icons
  for (const size of ICON_SIZES) {
    await sharp(SOURCE)
      .resize(size, size)
      .png()
      .toFile(path.join(ICONS_DIR, `icon-${size}.png`))
    console.log(`  ✓ icon-${size}.png`)
  }

  // iOS icons
  const IOS_ICONS_DIR = path.join(__dirname, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset')
  if (fs.existsSync(path.join(__dirname, 'ios'))) {
    fs.mkdirSync(IOS_ICONS_DIR, { recursive: true })
    for (const { size, scale } of IOS_ICONS) {
      const px = Math.round(size * scale)
      const filename = `icon-${size}x${size}@${scale}x.png`
      await sharp(SOURCE).resize(px, px).png().toFile(path.join(IOS_ICONS_DIR, filename))
      console.log(`  ✓ iOS: ${filename}`)
    }
  }

  // Splash screens (dark background + centered logo)
  console.log('\n🖼  Generating splash screens...')
  const ICON_FOR_SPLASH = 256
  const iconBuffer = await sharp(SOURCE).resize(ICON_FOR_SPLASH, ICON_FOR_SPLASH).png().toBuffer()

  for (const { width, height, name } of SPLASH_SIZES) {
    const iconLeft = Math.round((width  - ICON_FOR_SPLASH) / 2)
    const iconTop  = Math.round((height - ICON_FOR_SPLASH) / 2)

    await sharp({
      create: {
        width, height, channels: 4,
        background: { r: 8, g: 8, b: 16, alpha: 1 },
      }
    })
      .composite([{ input: iconBuffer, left: iconLeft, top: iconTop }])
      .png()
      .toFile(path.join(SPLASH_DIR, name))
    console.log(`  ✓ ${name}`)
  }

  console.log('\n✅ All icons and splash screens generated!')
  console.log('   Now run: npx cap sync')
}

generate().catch(console.error)
