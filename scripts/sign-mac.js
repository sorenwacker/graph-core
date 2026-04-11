const { execSync } = require('child_process')
const path = require('path')

exports.default = async function (context) {
  // Only sign on macOS
  if (process.platform !== 'darwin') {
    return
  }

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)

  console.log(`Ad-hoc signing: ${appPath}`)

  try {
    // Ad-hoc sign the app
    execSync(`codesign --force --deep --sign - "${appPath}"`, {
      stdio: 'inherit'
    })
    console.log('Ad-hoc signing complete')
  } catch (error) {
    console.error('Ad-hoc signing failed:', error.message)
    // Don't fail the build - unsigned apps still work with xattr
  }
}
