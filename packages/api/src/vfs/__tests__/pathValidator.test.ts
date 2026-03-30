import { describe, expect, it } from '@jest/globals';

import { validatePath, validateWritePath } from '../pathValidator.js';
import { VFSError } from '../types.js';

function describeValidatePath(): void {
  it('rejects empty path', () => {
    expect(() => {
      validatePath('');
    }).toThrow(VFSError);
    expect(() => {
      validatePath('');
    }).toThrow('Path cannot be empty');
  });

  it('rejects absolute paths', () => {
    expect(() => {
      validatePath('/etc/passwd');
    }).toThrow(VFSError);
  });

  it('rejects path traversal', () => {
    expect(() => {
      validatePath('../secret');
    }).toThrow(VFSError);
    expect(() => {
      validatePath('src/../../secret');
    }).toThrow(VFSError);
  });

  it('rejects null bytes', () => {
    expect(() => {
      validatePath('src/file\0.ts');
    }).toThrow(VFSError);
  });

  it('rejects .git paths on reads', () => {
    expect(() => {
      validatePath('.git/config');
    }).toThrow(VFSError);
    expect(() => {
      validatePath('.git/objects/abc');
    }).toThrow(VFSError);
  });
}

function describeValidatePathAllows(): void {
  it('normalizes paths', () => {
    expect(() => {
      validatePath('./src/file.ts');
    }).not.toThrow();
    expect(() => {
      validatePath('src//file.ts');
    }).not.toThrow();
    expect(() => {
      validatePath('src/file.ts/');
    }).not.toThrow();
  });

  it('accepts valid paths', () => {
    expect(() => {
      validatePath('src/auth/login.ts');
    }).not.toThrow();
    expect(() => {
      validatePath('README.md');
    }).not.toThrow();
    expect(() => {
      validatePath('package.json');
    }).not.toThrow();
  });
}

function describeValidateWritePathBlocks(): void {
  it('blocks node_modules by default', () => {
    expect(() => {
      validateWritePath('node_modules/foo/index.js');
    }).toThrow(VFSError);
  });

  it('blocks .env by default', () => {
    expect(() => {
      validateWritePath('.env');
    }).toThrow(VFSError);
    expect(() => {
      validateWritePath('.env.local');
    }).toThrow(VFSError);
  });

  it('always blocks .git on writes regardless of config', () => {
    const config = { blockedPatterns: [] };
    expect(() => {
      validateWritePath('.git/config', config);
    }).toThrow(VFSError);
  });
}

function describeValidateWritePathAllows(): void {
  it('allows node_modules reads (only blocks writes)', () => {
    expect(() => {
      validatePath('node_modules/foo/index.js');
    }).not.toThrow();
  });

  it('allows custom protectedPaths to replace defaults', () => {
    const config = { blockedPatterns: ['secrets/**'] };
    expect(() => {
      validateWritePath('node_modules/foo.js', config);
    }).not.toThrow();
    expect(() => {
      validateWritePath('secrets/key.pem', config);
    }).toThrow(VFSError);
  });

  it('allows empty protectedPaths (permits .env writes)', () => {
    const config = { blockedPatterns: [] };
    expect(() => {
      validateWritePath('.env', config);
    }).not.toThrow();
  });
}

describe('validatePath', () => {
  describeValidatePath();
  describeValidatePathAllows();
});

describe('validateWritePath', () => {
  describeValidateWritePathBlocks();
  describeValidateWritePathAllows();
});
