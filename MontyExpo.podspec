require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "MontyExpo"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/ex3ndr/monty-js"
  s.license      = package["license"]
  s.authors      = "ex3ndr"

  s.platforms    = { :ios => "15.1", :visionos => "1.0" }
  s.source       = { :git => "https://github.com/ex3ndr/monty-js", :tag => "#{s.version}" }

  s.source_files = [
    "ios/**/*.{swift,m,mm}",
    "cpp/**/*.{hpp,cpp}"
  ]

  load "nitrogen/generated/ios/MontyExpo+autolinking.rb"
  add_nitrogen_files(s)

  s.vendored_libraries = "ios/rust/libmonty_expo_ffi.a"
  s.preserve_paths = "ios/rust/**/*"

  s.dependency "React-jsi"
  s.dependency "React-callinvoker"
  install_modules_dependencies(s)
end
