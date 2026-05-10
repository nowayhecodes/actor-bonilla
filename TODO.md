### Tasks

1. [x] Refactor the typings in the types.ts file to make better and consistent usage of typia library.
2. [x] Refactor the current library to be imported as @actor-bonilla/core on the projects that will use this library.
3. [x] Create a second library that will be imported as @actor-bonilla/http.
    3.1. This library as the name sugests will be a feature rich http library on top of the actor system library.
    3.2. It must be built on top of node's native fetch api if possible because it uses undici, but if node 20.x doesn't provides the native fetch api, use the undici library.
    3.3. See the got library source code and documentation at https://github.com/sindresorhus/got to use as benchmark, and build the @actor-bonilla/http to beat it.
4. [x] Since this repository is starting to hold two libraries, decide what is better to handle this as a monorepo, altering what it needs to handle that, maybe separate package.json files, move the source code to a packages directory containing the 'core' and 'http' packages, each one with it's own package.json.
5. [x] Prepare it to handle individual npm publish and github release actions following the current semantic-release structure.
6. [ ] Do the proper documentation, usage examples, demos, benckmarking
