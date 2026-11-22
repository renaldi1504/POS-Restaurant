/** Ikon Material Symbols Rounded yang dipakai web pelanggan (semua dekoratif: teks/label ada di tombol). */
import { Icon } from './ui';

export const SearchIcon = ({ size = 24 }: { size?: number }) => <Icon name="search" size={size} />;
export const LocateIcon = ({ size = 24 }: { size?: number }) => <Icon name="my_location" size={size} />;
export const CheckIcon = ({ size = 18 }: { size?: number }) => <Icon name="check" size={size} />;
export const CameraIcon = ({ size = 24 }: { size?: number }) => <Icon name="photo_camera" size={size} />;
export const ChevronLeft = ({ size = 24 }: { size?: number }) => <Icon name="arrow_back" size={size} />;
/** Pin lokasi di peta placeholder (warna error = penanda tujuan). */
export const PinIcon = () => <Icon name="location_on" filled size={44} className="text-error drop-shadow" />;
