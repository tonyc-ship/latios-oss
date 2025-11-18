import { LLMService, LLM_MODELS } from '@/lib/llm-service';
import { supabase } from '@/lib/supabase';

export const runtime = 'edge'

async function WriteToDB(
  content: string, 
  episodeId: string, 
  podcastName: string,
  episodeTitle: string,
  episodePubDate: string,
  language: number, 
  userId: string) {
    if (!content) {
        console.log('No content to write to database');
        return;
    }
    try {
        console.log('Writing to database:');
        const { data, error } = await supabase
            .from('tbl_transcript')
            .upsert([
                {
                    episode_id: episodeId,
                    show_title: podcastName,
                    episode_title: episodeTitle,
                    publish_date: episodePubDate,
                    language: language,
                    content: content,
                    count: 1,
                    create_user_id: userId,
                    update_user_id: userId,
                    create_time: new Date().toISOString(),
                    update_time: new Date().toISOString(),
                    delete_status: 1,
                    status: 2, // 1 for processing, 2 for finished, 3 for failed
                }
            ], {
                onConflict: 'episode_id,language',
                ignoreDuplicates: false
            });

        if (error) {
            console.error('Error inserting into database:', error);
        } else {
            console.log('Save transcript to database success');
        }
    } catch (err) {
        console.error('Unexpected error while writing to database:', err);
    }
}

function GetPrompt(transcript: string, language: number) {
    const system_prompt = `You are a professional translator. Your task is to translate the podcast transcript while maintaining the original JSON structure. Only translate the "FinalSentence" field, keeping all other fields (StartMs, EndMs, SpeakerId) exactly as they are. You MUST output the COMPLETE JSON array, do not truncate or cut off the output.`;

    const languageMap: { [key: number]: string } = {
        1: 'English',
        2: 'Chinese',
        3: 'Japanese',
        4: 'Korean',
        5: 'French',
        6: 'German',
        7: 'Spanish',
        8: 'Italian'
    };

    const languageName = languageMap[language] || '';

    // Construct the prompt for the transcript translation
    const podcast_prompt = `
### Transcript to Translate (JSON format):
${transcript}
`;

    const task_prompt = `
### Your task:
1. Translate ONLY the "FinalSentence" field into ${languageName}
2. Maintain the exact same JSON structure
3. Preserve the original meaning and context
4. Keep technical terms or proper nouns in their original form if no common translation exists
5. IMPORTANT: If the translation contains double quotes ("), you must escape them with a backslash (\\"). For example, if you need to translate a quote like "Hello", it should be written as \\"Hello\\" in the FinalSentence field.
6. CRITICAL: You MUST output the COMPLETE JSON array. Do not truncate or cut off the output. If the input has 100 items, the output must also have exactly 100 items.
7. Ensure the output JSON is properly formatted and can be parsed by JSON.parse()
8. If the input is an empty array [], return an empty array []
`;

    const settings_prompt = `
Output the translated transcript in the exact same JSON format as the input, with only the "FinalSentence" field translated.
Example input:
[{"FinalSentence":"Hello world"}]

Example output:
[{"FinalSentence":"你好世界"}]

Example with quotes:
Input: [{"FinalSentence":"He said \"Hello\""}]
Output: [{"FinalSentence":"他说 \\"你好\\""}]

IMPORTANT: The output must be a complete, valid JSON array with the same number of items as the input.
`;

    const user_prompt = podcast_prompt + task_prompt + settings_prompt;

    return { system_prompt, user_prompt };
}

// LLM service implementation for non-streaming translation
async function translateWithLLM(systemPrompt: string, userPrompt: string): Promise<string> {
    const llmService = new LLMService();
    
    try {
        console.log('Using LLM service for translation');
        const result = await llmService.translateText(systemPrompt, userPrompt, 10000);
        console.log('LLM translation completed');
        return result;
    } catch (error) {
        console.error('LLM translation failed:', error);
        throw new Error(`Translation failed: ${error}`);
    }
}

export async function POST(req: Request) {
    const { episodeId, podcastName, episodeTitle, episodePubDate, userId, content, targetLanguage } = await req.json();

    // First check if translation already exists in database
    const { data: existingTranslation } = await supabase
        .from('tbl_transcript')
        .select('*')
        .eq('episode_id', episodeId)
        .eq('language', targetLanguage)
        .eq('delete_status', 1)
        .single();

    if (existingTranslation) {
        return new Response(existingTranslation.content, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    const { system_prompt, user_prompt } = GetPrompt(content, targetLanguage);

    console.log('System prompt:', system_prompt);
    console.log('User prompt:', user_prompt);

    let finalText = '';

    try {
        finalText = await translateWithLLM(system_prompt, user_prompt);
        console.log('Raw translation response:', finalText);

        // 更严格的响应文本清理
        finalText = finalText
            .replace(/```json\n?|\n?```/g, '') // 移除代码块标记
            .replace(/^[\s\S]*?\[/, '[') // 确保以 [ 开头
            .replace(/\][\s\S]*$/, ']') // 确保以 ] 结尾
            .replace(/,\s*\]/g, ']') // 移除最后一个元素后的逗号
            .replace(/,\s*$/g, '') // 移除末尾的逗号
            .trim();

        // 验证和修复 JSON 格式
        try {
            // 尝试解析 JSON 来验证格式
            const parsedJson = JSON.parse(finalText);
            
            // 验证数组长度是否与输入相同
            if (parsedJson.length !== JSON.parse(content).length) {
                throw new Error(`Output array length (${parsedJson.length}) does not match input array length (${JSON.parse(content).length})`);
            }
            
            // 确保所有 FinalSentence 字段中的双引号都被正确转义
            const fixedJson = parsedJson.map((item: any) => {
                if (item.FinalSentence) {
                    // 转义双引号
                    item.FinalSentence = item.FinalSentence.replace(/"/g, '\\"');
                }
                return item;
            });

            // 重新序列化为 JSON 字符串
            finalText = JSON.stringify(fixedJson);
        } catch (jsonError) {
            console.error('JSON parsing error:', jsonError);
            throw new Error('Invalid JSON format in translation response');
        }

        // 再次验证修复后的 JSON
        try {
            JSON.parse(finalText);
        } catch (finalError) {
            console.error('Final JSON validation error:', finalError);
            throw new Error('Failed to fix JSON format');
        }

        await WriteToDB(finalText, episodeId, podcastName, episodeTitle, episodePubDate, targetLanguage, userId);
        
        return new Response(finalText, {
            headers: {
                'Content-Type': 'application/json',
            },
        });

    } catch (error: any) {
        console.error('Translation error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
}