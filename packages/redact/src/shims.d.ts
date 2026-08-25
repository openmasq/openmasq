// `@huggingface/transformers` is an OPTIONAL, consumer-installed dependency, lazy-
// `import()`ed only by the `./ner` entry. Declare it untyped so the dynamic import
// type-checks even when the package isn't installed in this workspace; the loader
// already treats the module as `any` and adapts its shape defensively.
declare module "@huggingface/transformers";
