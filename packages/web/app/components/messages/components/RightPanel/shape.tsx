import Image from 'next/image';

import CardShapeImg from '@/app/components/messages/shared/assets';

export const ShapeSVG = () => {
  return (
    <Image
      src={CardShapeImg}
      alt=""
      width={0}
      height={0}
      sizes="100vw"
      className="w-full h-full object-contain ml-[50%]"
      unoptimized
    />
  );
};
