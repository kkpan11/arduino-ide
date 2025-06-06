// @ts-check
'use strict';

const semver = require('semver');
const { isNightly, isRelease } = require('./utils');

async function run() {
  /** @type {string} */
  const rawElectronVersion =
    require('../package.json').devDependencies['electron'];
  const electronVersion = semver.clean(rawElectronVersion.replace(/^\^/, ''));
  if (!electronVersion) {
    throw new Error(
      `Electron semver validation failed for version: '${rawElectronVersion}'.`
    );
  }
  const platform = electronPlatform();
  const version = await getVersion();
  /** @type {string|unknown} */
  const cliVersion = require('../../arduino-ide-extension/package.json')
    .arduino['arduino-cli'].version;
  const artifactName = await getArtifactName(version);
  const args = [
    '--publish',
    'never',
    '-c.electronVersion',
    electronVersion,
    '-c.extraMetadata.version',
    version,
    // overrides the `name` in the `package.json` to keep the `localStorage` location. (https://github.com/arduino/arduino-ide/pull/2144#pullrequestreview-1554005028)
    '-c.extraMetadata.name',
    'arduino-ide',
    `-c.${platform}.artifactName`,
    artifactName,
    '-c.extraMetadata.theia.frontend.config.appVersion',
    version,
    '-c.extraMetadata.theia.frontend.config.cliVersion',
    typeof cliVersion === 'string' ? cliVersion : '',
    '-c.extraMetadata.theia.frontend.config.buildDate',
    new Date().toISOString(),
    // when running in development mode, the main entry is a JS module generated by Theia. In the final application it's a custom module with the file logger.
    '-c.extraMetadata.main',
    './arduino-ide-electron-main.js',
  ];
  const updateChannel = getChannel();
  if (updateChannel) {
    // TODO: fix the default nightly update channel preference value if required.
    // It's disabled for now: https://github.com/arduino/arduino-ide/issues/2157.
    // args.push(
    //   '-c.extraMetadata.theia.frontend.config.arduino.ide.updateChannel',
    //   updateChannel
    // );
  }
  const cp = exec('electron-builder', args, { stdio: 'inherit' });
  await cp;
}

function electronPlatform() {
  switch (process.platform) {
    case 'win32': {
      return 'win';
    }
    case 'darwin': {
      return 'mac';
    }
    case 'linux': {
      return 'linux';
    }
    default:
      throw new Error(`Unsupported platform: ${process.platform}.`);
  }
}

/**
 * @returns {Promise<string>}
 */
async function getVersion() {
  /** @type {string} */
  let version = require('../package.json').version;
  if (!semver.valid(version)) {
    throw new Error(
      `Could not read version from root package.json. Version was: '${version}'.`
    );
  }
  if (!isRelease) {
    if (isNightly) {
      version = `${version}-nightly-${await timestamp()}`;
    } else {
      version = `${version}-snapshot-${await currentCommitish()}`;
    }
    if (!semver.valid(version)) {
      throw new Error(`Invalid patched version: '${version}'.`);
    }
  }
  return version;
}

/**
 * @param {string} version
 * @returns {Promise<string>}
 */
async function getArtifactName(version) {
  const { platform, arch } = process;
  version = isNightly ? `nightly-${await timestamp()}` : version;
  const name = 'arduino-ide';
  switch (platform) {
    case 'win32': {
      if (arch === 'x64') {
        return `${name}_${version}_Windows_64bit.\$\{ext}`;
      }
      throw new Error(`Unsupported platform, arch: ${platform}, ${arch}`);
    }
    case 'darwin': {
      if (arch === 'arm64') {
        return `${name}_${version}_macOS_arm64.\$\{ext}`;
      }
      return `${name}_${version}_macOS_64bit.\$\{ext}`;
    }
    case 'linux': {
      switch (arch) {
        case 'arm': {
          return `${name}_${version}_Linux_armv7.\$\{ext}`;
        }
        case 'arm64': {
          return `${name}_${version}_Linux_arm64.\$\{ext}`;
        }
        case 'x64': {
          return `${name}_${version}_Linux_64bit.\$\{ext}`;
        }
        default: {
          throw new Error(`Unsupported platform, arch: ${platform}, ${arch}`);
        }
      }
    }
    default:
      throw new Error(`Unsupported platform, arch: ${platform}, ${arch}`);
  }
}

function getChannel() {
  if (isRelease) {
    return 'stable';
  }
  if (isNightly) {
    return 'nightly';
  }
  return '';
}

async function timestamp() {
  const { default: dateFormat } = await import('dateformat');
  return dateFormat(new Date(), 'yyyymmdd');
}

async function currentCommitish() {
  return exec('git', ['rev-parse', '--short', 'HEAD']);
}

/**
 * @param {string} command
 * @param {readonly string[]} args
 * @param {import('execa').Options<string> | undefined} [options]
 * @returns {Promise<string>}
 */
async function exec(command, args, options) {
  const execa = await import('execa');
  const promise = execa.execa(command, args, options);
  const { stdout } = await promise;
  return stdout;
}

run();
