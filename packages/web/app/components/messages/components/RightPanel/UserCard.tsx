import { useTranslations } from 'next-intl';

import { parseChatId } from '@/app/utils/strs';

import { FinalUserInfoAPI } from '@/app/types/finalUsers';

import { ShapeSVG } from './shape';

interface UserCardProps {
  userInfo: FinalUserInfoAPI;
  userID: string;
  memberSince: string;
}

export const UserCard: React.FC<UserCardProps> = ({ userInfo, userID, memberSince }: UserCardProps) => {
  const t = useTranslations('messages');

  const parsedChat = parseChatId(userID);

  // For Instagram, prepend @ to the name and make lowercase
  // For WhatsApp, show the user's name with phone number below
  const displayName = parsedChat.source === 'instagram'
    ? `@${(userInfo.name || '').toLowerCase()}`
    : userInfo.name;

  return (
    <div className="h-[106px] cursor-default relative w-full border p-3 rounded-lg bg-white shadow-lg overflow-hidden">
      <div className="text-sm font-medium">{displayName}</div>
      {parsedChat.source !== 'instagram' && <div className="text-xs text-gray-600">{parsedChat.displayName}</div>}
      <div className="text-xs text-gray-600 mt-3">{t('Client since')}</div>
      <div className="text-xs font-medium">
        {memberSince.substring(0, 1).toUpperCase() + memberSince.substring(1)}
      </div>

      <div className="absolute top-0 right-0 w-[45%] h-full max-h-full overflow-hidden">
        <ShapeSVG />
      </div>
    </div>
  );
};
