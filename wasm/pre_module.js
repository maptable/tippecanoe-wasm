// Pre-module JS to ensure filesystem is available and configure environment
var Module = {}
Module.preRun = Module.preRun || []
Module.preRun.push(function () {
  console.log("Pre-run: Checking filesystem availability...")

  // Configure environment variables to limit file descriptor usage
  ENV = ENV || {}
  ENV.TIPPECANOE_MAX_THREADS = "1" // Limit thread usage to reduce file descriptor consumption

  if (typeof FS !== "undefined") {
    try {
      // Create temp directory
      FS.mkdir("/tmp")
      console.log("Successfully created /tmp directory")

      // Set filesystem limits and configuration
      FS.trackingDelegate = {}
      FS.trackingDelegate.openFlags = { READ: 1, WRITE: 2 }

      // Track file descriptor usage for debugging
      var openFiles = {}
      var fileDescriptors = 0

      FS.trackingDelegate.open = function (path, flags) {
        fileDescriptors++
        openFiles[path] = true
        console.log(
          "File opened: " + path + " (total: " + fileDescriptors + ")"
        )
      }

      FS.trackingDelegate.close = function (stream) {
        fileDescriptors--
        delete openFiles[stream.path]
        console.log(
          "File closed: " + stream.path + " (total: " + fileDescriptors + ")"
        )
      }

      // Configure maximum memory for file operations
      Module.MEMFS_APPEND_TO_TYPED_ARRAYS = true
    } catch (e) {
      if (e.code !== "EEXIST") {
        console.error("Error initializing filesystem:", e)
      } else {
        console.log("Temp directory already exists")
      }
    }
  } else {
    console.error("FS not available in preRun!")
  }
})

// Configure memory limits
Module.INITIAL_MEMORY = 256 * 1024 * 1024 // 256MB
Module.MAXIMUM_MEMORY = 2 * 1024 * 1024 * 1024 // 2GB
Module.ALLOW_MEMORY_GROWTH = true
