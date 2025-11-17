export interface EpisodeData {
  id: string;
  type: string;
  podcast_id: string;
  podcast_name: string;
  podcast_img: string;
  status: number;
  title: string;
  description: string;
  pub_date: string;
  author: string;
  enclosure_length: string;
  enclosure_type: string;
  audio_url: string;
  enclosure_url: string;
  itunes_image: string;
  itunes_duration: string;
  transcript_available?: boolean;
  transcript?: string;
} 


export const availableLanguages = [
  { code: '1', enName: 'English', cnName: '英语', nativeName: 'English' },
  { code: '2', enName: 'Chinese', cnName: '中文', nativeName: '中文' },
  { code: '3', enName: 'Japanese', cnName: '日语', nativeName: '日本語' },
  { code: '4', enName: 'Korean', cnName: '韩语', nativeName: '한국어' },
  { code: '5', enName: 'French', cnName: '法语', nativeName: 'Français' },
  { code: '6', enName: 'German', cnName: '德语', nativeName: 'Deutsch' },
  // { code: '7', enName: 'Spanish', cnName: '西班牙语', nativeName: 'Español' },
  // { code: '8', enName: 'Italian', cnName: '意大利语', nativeName: 'Italiano' },
];