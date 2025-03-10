#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | sed 's/#.*//g' | xargs)
fi

# Validate required environment variables
if [ -z "$EMSDK_PATH" ] || [ -z "$OUTPUT_PATH" ]; then
    echo "Error: EMSDK_PATH and OUTPUT_PATH must be set in .env file"
    exit 1
fi

source ${EMSDK_PATH}/emsdk_env.sh

# Exit on error
set -e

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Create build directory if it doesn't exist
mkdir -p "${SCRIPT_DIR}/build"
cd "${SCRIPT_DIR}/build"

# Configure with CMake
emcmake cmake ../wasm \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_CXX_FLAGS="-fPIC -sUSE_SQLITE3=1 -sUSE_ZLIB=1" \
    -DCMAKE_C_FLAGS="-fPIC -sUSE_SQLITE3=1 -sUSE_ZLIB=1" \
    -DCMAKE_EXE_LINKER_FLAGS="-sUSE_SQLITE3=1 -sUSE_ZLIB=1 -sWASM=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=256MB -sMAXIMUM_MEMORY=2GB -sEXPORTED_RUNTIME_METHODS=['UTF8ToString','stringToNewUTF8','FS'] -sEXPORTED_FUNCTIONS=['_malloc','_free']"

# Build the project
emmake make -j

echo "Build completed successfully!"
echo "Files generated:"
ls -lh tippecanoe_wasm.*

echo -e "${GREEN}Copying build artifacts...${NC}"
cp "tippecanoe_wasm.wasm" "${OUTPUT_PATH}"
cp "tippecanoe_wasm.js" "${OUTPUT_PATH}"
cp "${SCRIPT_DIR}/wasm/example.html" "${OUTPUT_PATH}"
