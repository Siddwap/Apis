import canvafy from "canvafy";
class SecurityImageGenerator {
  constructor() {
    this.defaultConfig = {
      avatar: "https://png.pngtree.com/thumb_back/fw800/background/20230117/pngtree-girl-with-red-eyes-in-anime-style-backdrop-poster-head-photo-image_49274352.jpg",
      background: "https://png.pngtree.com/thumb_back/fw800/background/20240911/pngtree-surreal-moonlit-panorama-pc-wallpaper-image_16148136.jpg",
      userTime: 6048e5,
      suspectTime: 6048e5,
      borderColor: "f0f0f0",
      locale: "en",
      overlayOpacity: .9
    };
    this.validLocales = ["en", "es", "fr", "de", "it", "pt", "ru", "zh", "ja"];
  }
  validateInputs({
    avatar,
    background,
    userTime,
    suspectTime,
    borderColor,
    locale,
    overlayOpacity
  }) {
    if (!avatar || typeof avatar !== "string") {
      throw new Error("Invalid or missing avatar URL");
    }
    if (!background || typeof background !== "string") {
      throw new Error("Invalid or missing background URL");
    }
    const parsedUserTime = Number(userTime);
    if (isNaN(parsedUserTime) || parsedUserTime < 0 || parsedUserTime > Date.now()) {
      throw new Error("Invalid user timestamp. Must be a non-negative number not in the future");
    }
    const parsedSuspectTime = Number(suspectTime);
    if (isNaN(parsedSuspectTime) || parsedSuspectTime < 0 || parsedSuspectTime > Date.now()) {
      throw new Error("Invalid suspect timestamp. Must be a non-negative number not in the future");
    }
    if (!/^([0-9A-Fa-f]{6})$/.test(borderColor)) {
      throw new Error("Invalid border color format. Must be a 6-digit hexadecimal color code");
    }
    if (!this.validLocales.includes(locale)) {
      throw new Error(`Invalid locale. Must be one of: ${this.validLocales.join(", ")}`);
    }
    const opacity = Number(overlayOpacity);
    if (isNaN(opacity) || opacity < 0 || opacity > 1) {
      throw new Error("Overlay opacity must be a number between 0 and 1");
    }
    return {
      avatar: avatar,
      background: background,
      userTime: parsedUserTime,
      suspectTime: parsedSuspectTime,
      borderColor: borderColor,
      locale: locale,
      overlayOpacity: opacity
    };
  }
  async generateSecurityImage({
    avatar,
    background,
    userTime,
    suspectTime,
    borderColor,
    locale,
    overlayOpacity
  }) {
    try {
      const securityImage = await new canvafy.Security().setAvatar(avatar).setBackground("image", background).setCreatedTimestamp(userTime).setSuspectTimestamp(suspectTime).setBorder(`#${borderColor}`).setLocale(locale).setAvatarBorder(`#${borderColor}`).setOverlayOpacity(overlayOpacity).build();
      return securityImage;
    } catch (error) {
      throw new Error(`Failed to generate security image: ${error.message}`);
    }
  }
}
export default async function handler(req, res) {
  const securityGenerator = new SecurityImageGenerator();
  try {
    const params = req.method === "GET" ? req.query : req.body;
    const config = {
      ...securityGenerator.defaultConfig,
      ...params
    };
    const validatedConfig = securityGenerator.validateInputs(config);
    const securityImage = await securityGenerator.generateSecurityImage(validatedConfig);
    res.setHeader("Content-Type", "image/png");
    return res.status(200).send(securityImage);
  } catch (error) {
    return res.status(400).json({
      error: error.message
    });
  }
}