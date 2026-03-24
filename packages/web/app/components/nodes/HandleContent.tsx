import { ArrowRight } from 'lucide-react';

export const HANDLE_SIZE = 16;
export const ICON_SIZE = 10;

// Pre-rendered static arrows - never re-render
const ArrowDownRed = (
  <ArrowRight size={ICON_SIZE} className="absolute text-red-400" style={{ transform: 'rotate(90deg)' }} />
);
const ArrowUpGreen = (
  <ArrowRight size={ICON_SIZE} className="absolute text-green-500" style={{ transform: 'rotate(-90deg)' }} />
);
const ArrowUpRed = (
  <ArrowRight size={ICON_SIZE} className="absolute text-red-400" style={{ transform: 'rotate(-90deg)' }} />
);
const ArrowDownGreen = (
  <ArrowRight size={ICON_SIZE} className="absolute text-green-500" style={{ transform: 'rotate(90deg)' }} />
);
const ArrowRightRed = (
  <ArrowRight size={ICON_SIZE} className="absolute text-red-400" style={{ transform: 'rotate(0deg)' }} />
);
const ArrowLeftGreen = (
  <ArrowRight size={ICON_SIZE} className="absolute text-green-500" style={{ transform: 'rotate(180deg)' }} />
);
const ArrowLeftRed = (
  <ArrowRight size={ICON_SIZE} className="absolute text-red-400" style={{ transform: 'rotate(180deg)' }} />
);
const ArrowRightGreen = (
  <ArrowRight size={ICON_SIZE} className="absolute text-green-500" style={{ transform: 'rotate(0deg)' }} />
);

// Pre-rendered static handle contents - never re-render
export const TopTargetContent = (
  <div className="relative w-full h-full flex flex-col justify-center items-center">{ArrowDownRed}</div>
);

export const TopSourceContent = (
  <div className="relative w-full h-full flex flex-col justify-center items-center">{ArrowUpGreen}</div>
);

export const BottomTargetContent = (
  <div className="relative w-full h-full flex flex-col justify-center items-center">{ArrowUpRed}</div>
);

export const BottomSourceContent = (
  <div className="relative w-full h-full flex flex-col justify-center items-center">{ArrowDownGreen}</div>
);

export const LeftTargetContent = (
  <div className="relative w-full h-full flex flex-col justify-center items-center">{ArrowRightRed}</div>
);

export const LeftSourceContent = (
  <div className="relative w-full h-full flex flex-col justify-center items-center">{ArrowLeftGreen}</div>
);

export const RightTargetContent = (
  <div className="relative w-full h-full flex flex-col justify-center items-center">{ArrowLeftRed}</div>
);

export const RightSourceContent = (
  <div className="relative w-full h-full flex flex-col justify-center items-center">{ArrowRightGreen}</div>
);

// Red border versions for nextNodeIsUser
export const TopTargetContentRed = (
  <div className="relative w-full h-full flex flex-col justify-center items-center">{ArrowDownRed}</div>
);

export const TopSourceContentRed = (
  <div className="relative w-full h-full flex flex-col justify-center items-center">{ArrowUpGreen}</div>
);

export const BottomTargetContentRed = (
  <div className="relative w-full h-full flex flex-col justify-center items-center">{ArrowUpRed}</div>
);

export const BottomSourceContentRed = (
  <div className="relative w-full h-full flex flex-col justify-center items-center">{ArrowDownGreen}</div>
);

export const LeftTargetContentRed = (
  <div className="relative w-full h-full flex flex-col justify-center items-center">{ArrowRightRed}</div>
);

export const RightSourceContentRed = (
  <div className="relative w-full h-full flex flex-col justify-center items-center">{ArrowRightGreen}</div>
);
