import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor",
  strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
};

const filled: SVGProps<SVGSVGElement> = { ...base, fill: "currentColor", stroke: "none" };

export const PlayIcon = () => <svg {...filled}><path d="M4.5 2.8v10.4a.6.6 0 0 0 .92.5l8-5.2a.6.6 0 0 0 0-1l-8-5.2a.6.6 0 0 0-.92.5Z" /></svg>;
export const PauseIcon = () => <svg {...filled}><rect x="3.5" y="2.5" width="3.2" height="11" rx="1" /><rect x="9.3" y="2.5" width="3.2" height="11" rx="1" /></svg>;
export const FramePrevIcon = () => <svg {...base}><path d="M10 3 5 8l5 5" /></svg>;
export const FrameNextIcon = () => <svg {...base}><path d="m6 3 5 5-5 5" /></svg>;
export const BackIcon = () => <svg {...base}><path d="M7 3 2.5 8 7 13M13.5 3 9 8l4.5 5" /></svg>;
export const ForwardIcon = () => <svg {...base}><path d="m9 3 4.5 5L9 13M2.5 3 7 8l-4.5 5" /></svg>;
export const VolumeIcon = () => <svg {...base}><path d="M2.5 6.2h2.4L8 3.5v9L4.9 9.8H2.5z" /><path d="M10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.3 3.8a6 6 0 0 1 0 8.4" /></svg>;
export const MuteIcon = () => <svg {...base}><path d="M2.5 6.2h2.4L8 3.5v9L4.9 9.8H2.5z" /><path d="m10.5 6 3.5 4M14 6l-3.5 4" /></svg>;
export const RegionIcon = () => <svg {...base}><path d="M2.5 5V3.5a1 1 0 0 1 1-1H5M11 2.5h1.5a1 1 0 0 1 1 1V5M13.5 11v1.5a1 1 0 0 1-1 1H11M5 13.5H3.5a1 1 0 0 1-1-1V11" /><path d="M6.5 6.5h3v3h-3z" /></svg>;
export const CommentIcon = () => <svg {...base}><path d="M2.5 3.8a1.3 1.3 0 0 1 1.3-1.3h8.4a1.3 1.3 0 0 1 1.3 1.3v6.2a1.3 1.3 0 0 1-1.3 1.3H7L4.2 13.7v-2.4h-.4a1.3 1.3 0 0 1-1.3-1.3z" /></svg>;
export const HelpIcon = () => <svg {...base}><circle cx="8" cy="8" r="6" /><path d="M6.3 6.2a1.8 1.8 0 1 1 2.5 1.7c-.5.3-.8.6-.8 1.2M8 11.3v.1" /></svg>;
export const CheckIcon = () => <svg {...base}><path d="m3.5 8.5 3 3 6-7" /></svg>;
export const ChevronIcon = () => <svg {...base}><path d="m4 6 4 4 4-4" /></svg>;
export const SendIcon = () => <svg {...base}><path d="M13.5 2.5 2.5 7l4 1.8L8.3 13zM6.5 8.8l7-6.3" /></svg>;
export const LockIcon = () => <svg {...base}><rect x="3.5" y="7" width="9" height="6.5" rx="1.3" /><path d="M5.5 7V5.3a2.5 2.5 0 0 1 5 0V7" /></svg>;
export const EditIcon = () => <svg {...base}><path d="m10.5 3 2.5 2.5L6 12.5l-3 .5.5-3z" /></svg>;
export const TrashIcon = () => <svg {...base}><path d="M3 4.5h10M6.2 4.5V3h3.6v1.5M4.5 4.5l.6 8.2a1 1 0 0 0 1 .8h3.8a1 1 0 0 0 1-.8l.6-8.2" /></svg>;
