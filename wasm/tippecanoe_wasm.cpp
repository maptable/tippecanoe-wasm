#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <emscripten/emscripten.h>
#include <string>
#include <sstream>
#include <vector>
#include <memory>
#include <fstream>
#include <sys/stat.h> // For mkdir
#include <cerrno>     // For errno
#include <stdlib.h>   // For setenv
#include <unistd.h>   // For read, pipe, etc.
#include <cstring>    // For strcspn
#include <thread>     // For thread
#include <atomic>     // For atomic
#include "../main.hpp"
#include "../options.hpp"
#include "../errors.hpp"

using namespace emscripten;

void clearGlobalState();

int main(int argc, char **argv);

progress_callback_type global_progress_callback;

// Define progress callback function type
static emscripten::val progressCallback = emscripten::val::null();

void progress_bridge_callback(double percentage, int step, const char *message)
{
    if (progressCallback.isNull() || progressCallback.typeOf() != val("function"))
        return;

    try
    {
        progressCallback(percentage, step, std::string(message));
    }
    catch (const std::exception &e)
    {
        std::cerr << "Exception in progress callback: " << e.what() << std::endl;
    }
}

// Set progress callback function
void setProgressCallback(emscripten::val callback)
{
    progressCallback = callback;
}

std::vector<unsigned char> processGeoJSON(std::string geojsonStr,
                                          std::string outputFormat,
                                          std::string argsStr)
{
    try
    {
        setenv("TIPPECANOE_MAX_THREADS", "1", 1);
        setenv("TIPPECANOE_NO_THREADS", "1", 1);

        global_progress_callback = progress_bridge_callback;

        // Create temporary directory if it doesn't exist using C++ approach
        std::string tmp_dir = "/tmp";
        try
        {
            // Create directory using C++ filesystem functions
            struct stat st;
            if (stat(tmp_dir.c_str(), &st) != 0)
            {
                // Directory doesn't exist, create it
                if (mkdir(tmp_dir.c_str(), 0777) != 0)
                {
                    std::cerr << "Failed to create directory " << tmp_dir
                              << ": " << strerror(errno) << std::endl;
                }
                else
                {
                    std::cout << "Successfully created directory: " << tmp_dir << std::endl;
                }
            }
        }
        catch (const std::exception &e)
        {
            std::cerr << "Error creating directory: " << e.what() << std::endl;
        }

        std::string input_path = "/tmp/input.geojson";

        // Write input data to virtual filesystem using C++ approaches
        try
        {
            // Use C++ fstream
            std::ofstream outfile(input_path, std::ios::out);
            if (!outfile.is_open())
            {
                throw std::runtime_error("Failed to open file for writing: " + input_path);
            }
            outfile << geojsonStr;
            outfile.close();

            if (outfile.fail())
            {
                throw std::runtime_error("Error writing to file: " + input_path);
            }

            std::cout << "Successfully wrote input file: " << input_path << std::endl;
        }
        catch (const std::exception &e)
        {
            std::cerr << "Error writing input file: " << e.what() << std::endl;
            std::vector<unsigned char> error_byte(1, static_cast<unsigned char>(EXIT_IMPOSSIBLE));
            return error_byte;
        }

        std::string output_path = "/tmp/output.";
        output_path += (outputFormat == "mbtiles") ? "mbtiles" : "pmtiles";

        // Prepare arguments for tippecanoe
        const char *args[100 + 1]; // +1 for nullptr terminator
        int argc = 0;

        args[argc++] = strdup("tippecanoe");
        args[argc++] = strdup("-o");
        args[argc++] = strdup(output_path.c_str());
        args[argc++] = strdup("-t");
        args[argc++] = strdup("/tmp");

        // Parse additional arguments
        bool inQuotes = false;
        std::string currentArg;

        if (!argsStr.empty())
        {
            for (size_t i = 0; i < argsStr.length(); i++)
            {
                char c = argsStr[i];

                if (c == '"')
                {
                    inQuotes = !inQuotes;
                    continue;
                }

                if (c == ' ' && !inQuotes)
                {
                    if (!currentArg.empty())
                    {
                        args[argc++] = strdup(currentArg.c_str());
                        currentArg.clear();
                    }
                }
                else
                {
                    currentArg += c;
                }
            }

            if (!currentArg.empty())
            {
                args[argc++] = strdup(currentArg.c_str());
            }
        }

        args[argc++] = strdup(input_path.c_str());
        args[argc] = nullptr;

        // Print command line arguments for debugging
        std::cout << "Command arguments: ";
        for (int i = 0; i < argc; i++)
        {
            std::cout << args[i] << " ";
        }
        std::cout << std::endl;

        // Notify initial progress
        if (!progressCallback.isNull() && progressCallback.typeOf() == val("function"))
        {
            try
            {
                progressCallback(0, std::string("Starting tippecanoe process"));
            }
            catch (...)
            {
                std::cerr << "Exception when calling progress callback" << std::endl;
                // Continue processing even if callback fails
            }
        }

        int result_code = main(argc, const_cast<char **>(args));

        // Reset global state after main execution
        clearGlobalState();

        // Free all allocated argument memory
        for (int i = 0; i < argc; i++)
        {
            if (args[i])
            {
                free((void *)args[i]);
                args[i] = nullptr;
            }
        }

        if (result_code == EXIT_SUCCESS)
        {
            try
            {
                std::ifstream file(output_path, std::ios::binary);
                if (!file)
                {
                    throw std::runtime_error("Failed to open output file: " + output_path);
                }

                // Read file into vector
                file.seekg(0, std::ios::end);
                size_t fileSize = file.tellg();
                file.seekg(0, std::ios::beg);

                std::vector<unsigned char> output_data(fileSize);
                file.read(reinterpret_cast<char *>(output_data.data()), fileSize);
                file.close();

                std::cout << "Output data size: " << output_data.size() << " bytes" << std::endl;

                // Notify completion progress
                if (!progressCallback.isNull() && progressCallback.typeOf() == val("function"))
                {
                    try
                    {
                        progressCallback(100, std::string("complete"));
                    }
                    catch (...)
                    {
                    }
                }

                // Clean up temporary files
                std::remove(input_path.c_str());
                std::remove(output_path.c_str());

                return output_data;
            }
            catch (const std::exception &e)
            {
                std::cerr << "Error reading output file: " << e.what() << std::endl;
            }
        }

        // clean up temporary files
        try
        {
            std::remove(input_path.c_str());
            std::remove(output_path.c_str());
        }
        catch (...)
        {
        }

        std::vector<unsigned char> error_byte(1, static_cast<unsigned char>(result_code));
        return error_byte;
    }
    catch (const std::exception &e)
    {
        std::cerr << "Exception in processGeoJSON: " << e.what() << std::endl;
        std::vector<unsigned char> error_byte(1, static_cast<unsigned char>(EXIT_IMPOSSIBLE));
        return error_byte;
    }
}

// Helper function to check if filesystem is initialized
bool isFileSystemReady()
{
    try
    {
        val fs = val::global("FS");
        return !fs.isUndefined() &&
               !fs["mkdir"].isUndefined() &&
               !fs["writeFile"].isUndefined();
    }
    catch (...)
    {
        return false;
    }
}

// Check if filesystem is ready
bool checkFSReady()
{
    return isFileSystemReady();
}

EMSCRIPTEN_BINDINGS(tippecanoe_module)
{
    register_vector<unsigned char>("Vector<unsigned char>");
    function("processGeoJSON", &processGeoJSON);
    function("checkFSReady", &checkFSReady);
    function("setProgressCallback", &setProgressCallback);
}

void clearGlobalState()
{
    // Reset key global variables from main.hpp/main_wasm.cpp
    extern int extra_detail;

    extern int optind;
    extern char *optarg;
    extern int quiet;
    extern int quiet_progress;
    extern json_logger logger;
    extern double progress_interval;
    extern std::atomic<double> last_progress;
    extern int geometry_scale;
    extern double simplification;
    extern double maxzoom_simplification;
    extern size_t max_tile_size;
    extern size_t max_tile_features;
    extern int cluster_distance;
    extern int tiny_polygon_size;
    extern int cluster_maxzoom;
    extern long justx;
    extern long justy;
    extern std::string attribute_for_id;
    extern size_t limit_tile_feature_count;
    extern size_t limit_tile_feature_count_at_maxzoom;
    extern unsigned int drop_denser;
    extern std::map<std::string, serial_val> set_attributes;
    extern unsigned long long preserve_point_density_threshold;
    extern unsigned long long preserve_multiplier_density_threshold;
    extern long long extend_zooms_max;
    extern int retain_points_multiplier;
    extern std::vector<std::string> unidecode_data;
    extern size_t maximum_string_attribute_length;
    extern std::string accumulate_numeric;

    extern std::vector<order_field> order_by;
    extern bool order_reverse;
    extern bool order_by_size;

    extern int prevent[256];
    extern int additional[256];
    extern std::vector<clipbbox> clipbboxes;

    // Reset to default values
    extra_detail = -1;

    optind = 0;
    optarg = NULL;
    quiet = 0;
    quiet_progress = 0;
    logger = json_logger();
    progress_interval = 0;
    last_progress = 0;
    geometry_scale = 0;
    simplification = 1;
    maxzoom_simplification = -1;
    max_tile_size = 500000;
    max_tile_features = 200000;
    cluster_distance = 0;
    tiny_polygon_size = 2;
    cluster_maxzoom = MAX_ZOOM;
    justx = -1;
    justy = -1;
    attribute_for_id = "";
    limit_tile_feature_count = 0;
    limit_tile_feature_count_at_maxzoom = 0;
    drop_denser = 0;
    set_attributes.clear();
    preserve_point_density_threshold = 0;
    preserve_multiplier_density_threshold = 0;
    extend_zooms_max = 0;
    retain_points_multiplier = 1;
    unidecode_data.clear();
    maximum_string_attribute_length = 0;
    accumulate_numeric = "";
    global_progress_callback = NULL;

    order_by.clear();
    order_reverse = false;
    order_by_size = false;

    // Reset prevent and additional arrays
    for (int i = 0; i < 256; i++)
    {
        prevent[i] = 0;
        additional[i] = 0;
    }

    // Clear clipbboxes
    clipbboxes.clear();
}
