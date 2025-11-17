import axios from 'axios';
import { toast } from '@/components/ui/use-toast';
// Removed useAuth import as we no longer use it here
// import { useAuth } from "@/lib/auth";

export const pollTranscriptFromDB = async (
    episodeId: string, 
    auth: any, // Add auth parameter
    language: number,
    interval = 3000, 
    timeout = 15 * 60 * 1000,
    
): Promise<string> => {
    // Removed useAuth() call
    // const auth = useAuth();
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        const transcriptData = await fetch(`/api/episode/transcript?episodeId=${episodeId}&language=${language}`,
        {
            headers: {
                'Authorization': `Bearer ${auth?.session?.access_token}`
            }
        }
        );
        if (transcriptData.ok) {
            const data = await transcriptData.json();
            if (data.status === 2) { // finished
                // Modified: Pass correct parameters to getData
                return await getData(data, episodeId, auth);
            } else if (data.status === 3) { // failed
                throw new Error(data.error || 'Transcription failed');
            }
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error('Polling timed out');
}

// const setUserRef = async (
//     userId: string, 
//     userName: string,
//     userEmail: string,
//     episodeId: string,
//     podcastName: string,
//     episodeTitle: string,
//     episodeDuration: string,
//     episodePubDate: string
// ) => {
//     try {
//         console.log('setUserRef: ', userId, userName, userEmail, episodeId, podcastName, episodeTitle, episodeDuration, episodePubDate);
//         await fetch(`/api/episode/summary/status`, {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//             body: JSON.stringify({
//                 userId: userId,
//                 dataId: episodeId,
//                 dataType: 2, // 1 for summary, 2 for transcript (unchanged comment)
//                 userName: userName,
//                 userEmail: userEmail,
//                 showTitle: podcastName,
//                 episodeTitle: episodeTitle,
//                 episodeDuration: episodeDuration,
//                 episodePubDate: episodePubDate,
//             }),
//         });
//     } catch (error) {
//         console.error('Error setting summary ref:', error);
//     }
// }

// Generate new transcript via API
export const generateTranscript = async (
    episodeId: string, 
    type: string,
    podcastName: string,
    episodeTitle: string,
    episodeDuration: string,
    episodePubDate: string,
    userId: string, 
    userName: string,
    userEmail: string,
    audioUrl: string,
    auth: any
) => {
    // For YouTube videos, we don't need to generate transcript as it's already available
    if (type === 'youtube') {
        try {
            // Use our server-side API endpoint to avoid CORS issues
            const response = await fetch(`/api/youtube/details?id=${episodeId}`);
            const data = await response.json();
            
            if (data.success && data.video && data.video.transcript) {
                const transcript = data.video.transcript;
                // Save transcript to database
                await saveTranscriptToDB(episodeId, transcript, type, podcastName, episodeTitle, episodePubDate, userId, auth);
                return transcript;
            } else {
                throw new Error('No transcript available for this YouTube video');
            }
        } catch (error) {
            console.error('Error getting YouTube transcript:', error);
            
            // Show a more helpful error message
            toast({
                title: 'Transcript Unavailable',
                description: 'This YouTube video does not have available transcripts or subtitles. Please try a different video.',
                variant: 'destructive',
            });
            return null;
        }
    }
    try {
        // console.log('generateTranscript: ', userId, userName, userEmail, episodeId, podcastName, episodeTitle, episodeDuration, episodePubDate);
        // setUserRef(userId, userName, userEmail, episodeId, podcastName, episodeTitle, episodeDuration, episodePubDate);

        // Initiate transcription and get task ID
        const requestData = {
            episode_id: episodeId,
            type: type,
            podcast_name: podcastName,
            episode_title: episodeTitle,
            episode_pub_date: episodePubDate,
            user_id: userId,
            url: audioUrl,
            force_download: true  // Force download and upload to S3
        };
        
        const postResponse = await axios.post('/api/media/transcribe', requestData, {
            headers: {
                'Authorization': `Bearer ${auth?.session?.access_token}`
            },
            timeout: 15 * 60 * 1000 // 15 minute timeout
        });
        const taskId = postResponse.data.task_id;
        if (!taskId) {
            throw new Error('No task ID returned from transcription service');
        }

        // Poll for the transcription result - pass auth parameter
        const language = type==='xyz'? 2:1;
        const transcript = await pollTranscriptFromDB(episodeId, auth, language);
        return transcript;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNABORTED') {
                console.error('Request timeout after 15 minutes');
                toast({
                    title: 'Timeout Error',
                    description: 'The transcription request timed out. Please try again.',
                    variant: 'destructive',
                });
            } else {
                toast({
                    title: 'Error',
                    description: `Transcription failed: ${error.message}`,
                    variant: 'destructive',
                });
            }
        }
        return null;
    }
}


// Save transcript to database
const saveTranscriptToDB = async (
    episodeId: string,
    transcript: string,
    type: string,
    podcastName: string,
    episodeTitle: string,
    episodePubDate: string,
    userId: string,
    auth: any
) => {
    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        
        // Add Authorization header if auth token is available
        if (auth?.session?.access_token) {
            headers['Authorization'] = `Bearer ${auth.session.access_token}`;
        }

        const response = await fetch('/api/episode/transcript', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                episode_id: episodeId,
                type: type,
                podcast_name: podcastName,
                episode_title: episodeTitle,
                episode_pub_date: episodePubDate,
                user_id: userId || 'guest',
                transcript: transcript,
                status: 2 // Completed
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to save transcript to database');
        }

        return await response.json();
    } catch (error) {
        console.error('Error saving transcript to database:', error);
        throw error;
    }
};

const getData = async (data: any, userId: string, auth: any) => {
    // Always return full content (no subscription checks)
    return data?.content || '';
}