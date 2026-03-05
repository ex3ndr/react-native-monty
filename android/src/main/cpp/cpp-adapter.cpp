#include <jni.h>
#include "MontyExpoOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return margelo::nitro::montyexpo::initialize(vm);
}
