declare module 'sharp' {
  interface ResizeOptions {
    width?: number;
    height?: number;
    fit?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside';
    position?: string;
    background?: { r: number; g: number; b: number; alpha: number };
    kernel?: string;
    withoutEnlargement?: boolean;
    withoutReduction?: boolean;
    fastShrinkOnLoad?: boolean;
  }

  interface PngOptions {
    quality?: number;
    compressionLevel?: number;
    progressive?: boolean;
    palette?: boolean;
    effort?: number;
  }

  interface Sharp {
    resize(width?: number, height?: number, options?: ResizeOptions): Sharp;
    resize(options?: ResizeOptions): Sharp;
    png(options?: PngOptions): Sharp;
    jpeg(options?: any): Sharp;
    toBuffer(): Promise<Buffer>;
    toFile(file: string): Promise<void>;
  }

  function sharp(input: Buffer | string, options?: { density?: number }): Sharp;
  export default sharp;
} 