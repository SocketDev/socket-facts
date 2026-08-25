# Trust boundary

This package runs a build-tool invocation. It never decides that an invocation
is safe to run. That decision belongs to whoever reads the repository's
configuration, because that configuration is attacker-controlled.

## What the consumer owns

Vetting `bin` and `opts` before they reach this package. A consumer that reads
those values out of a repository's own configuration is reading
attacker-controlled input, and the refusal list is build-tool integration
knowledge: Gradle's `-I` / `--init-script` / `--gradle-user-home` /
`-Dorg.gradle.java.home`, Maven's `-Dmaven.ext.class.path` / `-s` /
`-Dmaven.repo.local`, sbt's `-J` / `-Dsbt.global.base` / a bare `eval`. Every one
of those re-points the build at code or at a repository the scan did not choose.

That gate belongs with the consumer, not here: moving it in would mean the party
selling the completeness guarantee trusts somebody else's argv construction.

It is an OBLIGATION on the consumer, not a guarantee this package can lean on:
whoever takes this package as a dependency owns that vetting. Note that the
dotnet tool accepts `-p:Key=Value` MSBuild global properties, and
`--property:`, which apply to the whole session — evaluation, restore, and
reading alike — so vetting has to cover that surface too.

## What this package refuses to decide

`assertFactsInvocation` runs before anything is spawned and throws on:

| Field  | Refused when                              | Why not default it                                                                |
| ------ | ----------------------------------------- | --------------------------------------------------------------------------------- |
| `tool` | not `dotnet`, `gradle`, `maven`, or `sbt` | picking a tool from the directory contents is a detection policy                  |
| `bin`  | absent, empty, or relative                | a PATH lookup or a `./gradlew` probe picks an executable the consumer did not vet |
| `opts` | absent, or holding a non-string           | an omitted array reads as "no options" when it may mean "the filter never ran"    |
| `env`  | absent, or not an object                  | falling back to `process.env` reintroduces the argument-injection gap below       |
| `cwd`  | absent, empty, or relative                | `process.cwd()` resolves a different project than the caller meant                |

Each failure names the field, what was wanted, and that the caller must supply
it. None of them is recoverable by guessing, so none of them is guessed.

`src/run/build-tool.mts` exports what the consumer needs to compute a candidate -
the conventional binary name per tool, the wrapper filename per tool, and the
absolute path a wrapper would occupy. All three are pure. The wrapper helper does
not check that the file exists, because existence is not the question the
consumer is answering; trust is.

## The environment gap this extraction closed

socket-cli's facts spawn inherited `process.env` wholesale, so `GRADLE_OPTS`,
`JAVA_TOOL_OPTIONS`, `MAVEN_OPTS`, and `_JAVA_OPTIONS` reached the build as extra
JVM arguments. Other spawn paths in that codebase already scrubbed
(`spawn-coana.mts` strips `npm_package_*`; `convert-sbt-to-maven.mts` uses a
sanitized PATH lookup), so this one was an inconsistency, not a policy.

Here the environment is a required field, and `envPolicy` defaults to `'scrub'`,
which removes every variable in `BUILD_TOOL_ARGUMENT_ENV_VARS`. `JAVA_HOME` is
deliberately not in that list: it selects a JDK rather than injecting arguments,
and sbt's launcher needs it. A caller that genuinely wants pass-through asks for
`envPolicy: 'as-given'` by name.
