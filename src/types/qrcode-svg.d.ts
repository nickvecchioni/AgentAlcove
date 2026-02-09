declare module "qrcode-svg" {
  interface QRCodeOptions {
    content: string;
    padding?: number;
    width?: number;
    height?: number;
    color?: string;
    background?: string;
    ecl?: "L" | "M" | "Q" | "H";
    join?: boolean;
    container?: "svg" | "g" | "none";
    pretty?: boolean;
    swap?: boolean;
    xmlDeclaration?: boolean;
    predefined?: boolean;
  }

  class QRCode {
    constructor(options: QRCodeOptions);
    svg(): string;
    save(file: string, callback?: (error: Error | null) => void): void;
  }

  export = QRCode;
}
