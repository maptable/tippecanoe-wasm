/**
 * Interface to the Tippecanoe WASM module
 * This file will be integrated into the main WASM JavaScript output
 */

;(function () {
  // Define processing steps
  const STEPS = {
    START: 0,
    ERROR: -1
  }

  // Store the original module creation function and its configuration
  var originalCreateModule = createTippecanoeModule

  // Replace the global function with our enhanced version
  createTippecanoeModule = function (moduleOverrides) {
    // Set up default module configuration with filesystem initialization
    moduleOverrides = moduleOverrides || {}

    // Ensure filesystem is initialized and available
    moduleOverrides.noFSInit = false

    // Add proper error handling
    moduleOverrides.onAbort = function (reason) {
      console.error("WASM module aborted:", reason)
      // If there's a progress callback, report the error
      if (typeof progressCallbackRef === "function") {
        progressCallbackRef(-1, "WASM aborted: " + reason)
      }
    }

    // Save progress callback reference at module level for error reporting
    var progressCallbackRef = null

    // Save any existing preRun functions
    var existingPreRun = moduleOverrides.preRun || []
    moduleOverrides.preRun = Array.isArray(existingPreRun)
      ? existingPreRun
      : [existingPreRun]

    // Add our own preRun function to initialize filesystem
    moduleOverrides.preRun.unshift(function () {
      if (typeof this.FS === "undefined") {
        console.warn("FS object not available in preRun")
      } else {
        try {
          this.FS.mkdir("/tmp")
        } catch (e) {
          // Directory might already exist
        }
      }
    })

    // Make sure filesystem methods are available
    moduleOverrides.EXPORTED_RUNTIME_METHODS =
      moduleOverrides.EXPORTED_RUNTIME_METHODS || []

    var requiredMethods = [
      "FS",
      "ccall",
      "cwrap",
      "UTF8ToString",
      "stringToNewUTF8"
    ]
    for (var i = 0; i < requiredMethods.length; i++) {
      var method = requiredMethods[i]
      if (!moduleOverrides.EXPORTED_RUNTIME_METHODS.includes(method)) {
        moduleOverrides.EXPORTED_RUNTIME_METHODS.push(method)
      }
    }

    // Call the original module creator with our overrides
    var modulePromise = originalCreateModule(moduleOverrides)

    // Once the module is loaded, add our interface to it
    return modulePromise
      .then(function (Module) {
        if (!Module.FS) {
          console.error("FS object is not available after initialization!")
        }

        // Define the interface creation method directly to the Module
        Module.createTippecanoeInterface = function () {
          // Format timestamp in local timezone
          function getTimestamp() {
            const date = new Date()
            return date
              .toLocaleString("en-US", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false
              })
              .replace(/\//g, "-")
          }

          // Progress callback variable
          let _progressCallback = null

          return {
            // Initialize method - check file system readiness
            init: function () {
              if (!this.isReady()) {
                console.error("File system is not ready!")
                return Promise.reject(new Error("Filesystem not ready"))
              }

              return Promise.resolve(Module)
            },

            // Set progress callback
            setProgressCallback: function (callback) {
              _progressCallback = callback
              progressCallbackRef = callback // Store at module level for error reporting

              try {
                // Wire up the C++ progress callback function
                if (typeof Module.setProgressCallback === "function") {
                  Module.setProgressCallback(function (
                    progress,
                    step,
                    message
                  ) {
                    if (_progressCallback) {
                      try {
                        _progressCallback(progress, step, message)
                      } catch (e) {
                        console.error("Error in progress callback:", e)
                      }
                    }
                  })
                } else {
                  console.warn("C++ progress callback not available")
                }
              } catch (e) {
                console.error("Error setting progress callback:", e)
              }
            },

            // Process GeoJSON to PMTiles or MBTiles
            processGeoJSON: function (geojsonContent, outputFormat, args) {
              try {
                // Check if file system is ready
                if (!this.isReady()) {
                  console.error("File system not ready in processGeoJSON")
                  return Promise.reject(new Error("Filesystem not ready"))
                }

                // Notify progress start
                if (_progressCallback) {
                  _progressCallback(0, STEPS.START, "Starting process...")
                }

                try {
                  // Safety check for argument length
                  if (!geojsonContent || geojsonContent.length === 0) {
                    console.warn("Warning: Empty GeoJSON content")
                    if (_progressCallback) {
                      _progressCallback(
                        -1,
                        STEPS.ERROR,
                        "Empty GeoJSON content"
                      )
                    }
                    return Promise.reject(new Error("Empty GeoJSON content"))
                  }

                  var result = Module.processGeoJSON(
                    geojsonContent,
                    outputFormat || "pmtiles",
                    args || ""
                  )
                } catch (e) {
                  console.error("Exception during processGeoJSON call:", e)
                  if (_progressCallback) {
                    _progressCallback(
                      -1,
                      STEPS.ERROR,
                      `Error: ${e.message || e}`
                    )
                  }
                  return Promise.reject(e)
                }

                // check if result is valid
                if (!result || result.size() === 0) {
                  console.warn("Empty result from processGeoJSON")
                  if (_progressCallback) {
                    _progressCallback(-1, STEPS.ERROR, "Empty result")
                  }
                  return Promise.reject(new Error("Empty result"))
                }

                if (result.size() === 1) {
                  var errorCode = result.get(0)
                  console.warn("Processing resulted in error code:", errorCode)
                  if (_progressCallback) {
                    _progressCallback(
                      -1,
                      STEPS.ERROR,
                      `Error code: ${errorCode}`
                    )
                  }
                  return Promise.reject(new Error(`Error code: ${errorCode}`))
                }

                var buffer = new Uint8Array(result.size())
                for (var i = 0; i < result.size(); i++) {
                  buffer[i] = result.get(i)
                }

                return Promise.resolve(buffer)
              } catch (error) {
                console.error("Error in processGeoJSON:", error)
                if (_progressCallback) {
                  _progressCallback(
                    -1,
                    STEPS.ERROR,
                    `Error: ${error.message || error}`
                  )
                }
                return Promise.reject(error)
              }
            },

            // Check if module's file system is ready
            isReady: function () {
              try {
                return (
                  typeof Module.FS !== "undefined" &&
                  typeof Module.FS.mkdir === "function" &&
                  typeof Module.FS.writeFile === "function"
                )
              } catch (e) {
                console.error("Error checking if FS is ready:", e)
                return false
              }
            }
          }
        }

        // For backward compatibility
        if (typeof Module.processGeoJSON !== "function") {
          Module.processGeoJSON = function (
            geojsonContent,
            outputFormat,
            args
          ) {
            console.warn(
              "Direct processGeoJSON call is deprecated. Use the object interface instead."
            )
            try {
              // Check if file system is ready
              if (
                typeof Module.FS === "undefined" ||
                typeof Module.FS.mkdir !== "function" ||
                typeof Module.FS.writeFile !== "function"
              ) {
                console.error("File system not ready for direct call")
                return -1
              }

              // Call the C++ exported function
              var result = Module.ccall(
                "processGeoJSON", // function name
                "string", // return type
                ["string", "string", "string"], // parameter types
                [geojsonContent, outputFormat, args || ""] // parameters
              )

              if (!result || result.length === 0) {
                console.error("Empty result from processGeoJSON")
                return -1
              }

              // Check if result is an error code (single byte)
              if (result.length === 1) {
                return result.charCodeAt(0)
              }

              // Return result as Uint8Array
              var buffer = new Uint8Array(result.length)
              for (var i = 0; i < result.length; i++) {
                buffer[i] = result.charCodeAt(i)
              }

              return buffer
            } catch (error) {
              console.error("Error in direct processGeoJSON call:", error)
              return -1
            }
          }
        }

        return Module
      })
      .catch(function (err) {
        console.error("Error initializing module:", err)
        throw err
      })
  }
})()
