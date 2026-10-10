export interface Media {
  id: number;
  file_name: string;
  url: string;
  mime_type?: string;
  size?: number;
  tags?: string[];
  created_at?: string;
  [key: string]: any;
}
