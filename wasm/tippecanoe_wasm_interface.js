/**
 * Interface to the Tippecanoe WASM module
 * This file will be integrated into the main WASM JavaScript output
 */

// We need to adapt the code to work with the Module object that Emscripten provides
;(function () {
  // Store the original module creation function
  var originalCreateModule = createTippecanoeModule

  // Replace the global function with our enhanced version
  createTippecanoeModule = function (moduleOverrides) {
    // Set up default module configuration with filesystem initialization
    moduleOverrides = moduleOverrides || {}

    // Ensure filesystem is initialized and available
    moduleOverrides.noFSInit = false

    // Save any existing preRun functions
    var existingPreRun = moduleOverrides.preRun || []
    moduleOverrides.preRun = Array.isArray(existingPreRun)
      ? existingPreRun
      : [existingPreRun]

    // Add our own preRun function to initialize filesystem
    moduleOverrides.preRun.unshift(function () {
      console.log("Pre-run: Setting up filesystem...")

      // Create a simple consistency check function
      if (typeof this.FS === "undefined") {
        console.warn("FS object not available in preRun")
      } else {
        console.log("FS object is available in preRun")
        try {
          // Create the tmp directory early
          this.FS.mkdir("/tmp")
        } catch (e) {
          // Directory might already exist
          console.log("Could not create /tmp directory (might already exist)")
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
        console.log("Module initialized, attaching interface...")

        // Wait for the filesystem to be ready
        if (Module.FS) {
          console.log("FS is available immediately")
        } else {
          console.error("FS object is not available after initialization!")
        }

        // Define the interface creation method directly to the Module
        Module.createTippecanoeInterface = function () {
          // Format timestamp in local timezone
          function getTimestamp() {
            const date = new Date()
            return date
              .toLocaleString("zh-CN", {
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

          return {
            // Initialize method - check file system readiness
            init: function () {
              console.log("Initializing tippecanoe interface")

              if (!this.isReady()) {
                console.error("File system is not ready!")
                return Promise.reject(new Error("Filesystem not ready"))
              }

              return Promise.resolve(Module)
            },

            // Process GeoJSON to PMTiles or MBTiles
            processGeoJSON: function (geojsonContent, outputFormat, args) {
              try {
                // Check if file system is ready
                if (!this.isReady()) {
                  console.error("File system not ready in processGeoJSON")
                  return Promise.reject(new Error("Filesystem not ready"))
                }

                console.log(
                  `[${getTimestamp()}] Processing GeoJSON with format:`,
                  outputFormat
                )

                var result = Module.processGeoJSON(
                  geojsonContent,
                  outputFormat,
                  args || ""
                )

                // check if result is valid
                if (result.size() === 1) {
                  var errorCode = result.get(0)
                  console.warn("Processing resulted in error code:", errorCode)
                  return Promise.resolve(errorCode)
                }

                var buffer = new Uint8Array(result.size())
                for (var i = 0; i < result.size(); i++) {
                  buffer[i] = result.get(i)
                }

                console.log(
                  `[${getTimestamp()}] Successfully processed data, size:`,
                  buffer.length
                )
                return Promise.resolve(buffer)
              } catch (error) {
                console.error("Error in processGeoJSON:", error)
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

        console.log("Interface attached to module")
        return Module
      })
      .catch(function (err) {
        console.error("Error initializing module:", err)
        throw err
      })
  }
})()
