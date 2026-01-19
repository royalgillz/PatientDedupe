cmake_minimum_required(VERSION 3.20)
project(patientdedupe_engine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# The matching engine as a small static library, reused by the demo, the
# benchmark, the tests, and (via a separate Emscripten build) the WebAssembly module.
add_library(pdd_engine STATIC
  src/metrics.cpp
  src/nicknames.cpp
  src/matcher.cpp)
target_include_directories(pdd_engine PUBLIC include)

add_executable(pdd_demo src/cli.cpp)
target_link_libraries(pdd_demo PRIVATE pdd_engine)

add_executable(pdd_bench bench/benchmark.cpp)
target_link_libraries(pdd_bench PRIVATE pdd_engine)

add_executable(pdd_eval src/eval.cpp)
target_link_libraries(pdd_eval PRIVATE pdd_engine)

# Catch2, vendored as the amalgamated single source so there is nothing to fetch.
add_library(catch2 STATIC vendor/catch2/catch_amalgamated.cpp)
target_include_directories(catch2 PUBLIC vendor vendor/catch2)

add_executable(pdd_tests tests/test_metrics.cpp tests/test_matcher.cpp)
target_link_libraries(pdd_tests PRIVATE pdd_engine catch2)

enable_testing()
add_test(NAME unit COMMAND pdd_tests)
