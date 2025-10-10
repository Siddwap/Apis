import canvafy from "canvafy";
class ShipImageGenerator {
  constructor() {
    this.defaultConfig = {
      avatar: "https://png.pngtree.com/thumb_back/fw800/background/20230117/pngtree-girl-with-red-eyes-in-anime-style-backdrop-poster-head-photo-image_49274352.jpg",
      avatar2: "https://png.pngtree.com/thumb_back/fw800/background/20230117/pngtree-girl-with-red-eyes-in-anime-style-backdrop-poster-head-photo-image_49274352.jpg",
      background: "https://png.pngtree.com/thumb_back/fw800/background/20240911/pngtree-surreal-moonlit-panorama-pc-wallpaper-image_16148136.jpg",
      borderColor: "f0f0f0",
      overlayOpacity: .5
    };
  }
  validateInputs({
    avatar,
    avatar2,
    background,
    borderColor,
    overlayOpacity
  }) {
    if (!avatar || typeof avatar !== "string") {
      throw new Error("Invalid or missing first avatar URL");
    }
    if (!avatar2 || typeof avatar2 !== "string") {
      throw new Error("Invalid or missing second avatar URL");
    }
    if (!background || typeof background !== "string") {
      throw new Error("Invalid or missing background URL");
    }
    if (!/^([0-9A-Fa-f]{6})$/.test(borderColor)) {
      throw new Error("Invalid border color format. Must be a 6-digit hexadecimal color code");
    }
    const opacity = Number(overlayOpacity);
    if (isNaN(opacity) || opacity < 0 || opacity > 1) {
      throw new Error("Overlay opacity must be a number between 0 and 1");
    }
    return {
      avatar: avatar,
      avatar2: avatar2,
      background: background,
      borderColor: borderColor,
      overlayOpacity: opacity
    };
  }
  async generateShipImage({
    avatar,
    avatar2,
    background,
    borderColor,
    overlayOpacity
  }) {
    try {
      const shipImage = await new canvafy.Ship().setAvatars(avatar, avatar2).setBackground("image", background).setBorder(`#${borderColor}`).setOverlayOpacity(overlayOpacity).build();
      return shipImage;
    } catch (error) {
      throw new Error(`Failed to generate ship image: ${error.message}`);
    }
  }
}
export default async function handler(req, res) {
  const shipGenerator = new ShipImageGenerator();
  try {
    const params = req.method === "GET" ? req.query : req.body;
    const config = {
      ...shipGenerator.defaultConfig,
      ...params
    };
    const validatedConfig = shipGenerator.validateInputs(config);
    const shipImage = await shipGenerator.generateShipImage(validatedConfig);
    res.setHeader("Content-Type", "image/png");
    return res.status(200).send(shipImage);
  } catch (error) {
    return res.status(400).json({
      error: error.message
    });
  }
}