import { genConfig } from 'react-nice-avatar';

/**
 * Generates an avatar configuration with optional gender override
 * @param identifier - Email, phone, or unique identifier for the avatar
 * @param userGender - Optional gender from finalUserInfo ("male" or "female")
 * @returns Avatar configuration object
 */
export const generateAvatarConfig = (identifier: string, userGender?: string) => {
  const initialConfig = genConfig(identifier);

  if (!userGender) {
    return initialConfig;
  }

  // Convert "male"/"female" to "man"/"woman" for genConfig
  const sex = userGender === 'male' ? 'man' : userGender === 'female' ? 'woman' : undefined;

  if (!sex) {
    return initialConfig;
  }

  return genConfig({ ...initialConfig, sex });
};
