cmake_minimum_required(VERSION 3.13)
project(tippecanoe-wasm)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Source files
set(SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/tippecanoe_wasm.cpp
    ../main.cpp
    ../tile.cpp
    ../geojson.cpp 
    ../jsonpull/jsonpull.c
    ../pool.cpp
    ../mbtiles.cpp
    ../geometry.cpp
    ../projection.cpp
    ../memfile.cpp
    ../mvt.cpp
    ../serial.cpp
    ../platform.cpp
    ../text.cpp
    ../dirtiles.cpp
    ../pmtiles_file.cpp
    ../plugin.cpp
    ../read_json.cpp
    ../write_json.cpp
    ../geobuf.cpp
    ../flatgeobuf.cpp
    ../evaluator.cpp
    ../geocsv.cpp
    ../csv.cpp
    ../geojson-loop.cpp
    ../json_logger.cpp
    ../visvalingam.cpp
    ../compression.cpp
    ../clip.cpp
    ../sort.cpp
    ../attribute.cpp
    ../shared_borders.cpp
    ../clipper2/src/clipper.engine.cpp
)

# WASM specific settings
if(EMSCRIPTEN)
    set(WASM_FLAGS "-sUSE_SQLITE3=1 -sUSE_ZLIB=1 -sALLOW_MEMORY_GROWTH=1 -sIMPORTED_MEMORY=1 -sINITIAL_MEMORY=256MB -sMAXIMUM_MEMORY=2GB -sFORCE_FILESYSTEM=1 -sEXPORT_ALL=1 -sMODULARIZE=1 -sFILESYSTEM=1 -sEXPORT_ES6=0 -sEXPORT_NAME=createTippecanoeModule -sINVOKE_RUN=0")
    set(EXPORTED_FUNCTIONS "-sEXPORTED_FUNCTIONS=['_malloc','_free','_main']")
    set(EXPORTED_RUNTIME "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','stringToNewUTF8','FS']")
    
    # Add interface file using --post-js option
    set(INTERFACE_JS "${CMAKE_CURRENT_SOURCE_DIR}/tippecanoe_wasm_interface.js")
    set(POST_JS_FLAG "--post-js=${INTERFACE_JS}")

    # Compile options
    add_compile_options(
        -g -Wall -Wshadow -Wsign-compare -Wextra 
        -Wno-c++11-narrowing
        -Wno-implicit-const-int-float-conversion
        -Wno-sign-compare
        -Wno-unused-parameter
    )
    
    # Set flags
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} ${WASM_FLAGS} -std=c++17 -fPIC")
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} ${WASM_FLAGS} -fPIC")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} ${WASM_FLAGS} ${EXPORTED_FUNCTIONS} ${EXPORTED_RUNTIME} --bind -sWASM=1 ${POST_JS_FLAG}")

    set(INTERFACE_JS "${CMAKE_CURRENT_SOURCE_DIR}/tippecanoe_wasm_interface.js")

    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} --post-js=${INTERFACE_JS} --extern-post-js=${INTERFACE_JS}")

    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','stringToNewUTF8','FS']")

    set(PRE_JS "${CMAKE_CURRENT_SOURCE_DIR}/pre_module.js")
    message(STATUS "Using pre_module.js for filesystem initialization")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} --pre-js=${PRE_JS}")
endif()

# Create WASM target
add_executable(tippecanoe_wasm ${SOURCES})

# Include directories
target_include_directories(tippecanoe_wasm PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/..
    ${CMAKE_CURRENT_SOURCE_DIR}/../include
    ${CMAKE_CURRENT_SOURCE_DIR}/../protozero
    ${CMAKE_CURRENT_SOURCE_DIR}/../clipper2/include
)

# Compile definitions
target_compile_definitions(tippecanoe_wasm PUBLIC
    WASM_BUILD
    NDEBUG
    EMSCRIPTEN_BUILD
    SIZE_MAX=UINT32_MAX
    TIPPECANOE_WASM=1
)