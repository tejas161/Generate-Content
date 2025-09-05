const { Ollama } = require('ollama');
const { logger } = require('../utils/logger');

class LLMService {
  constructor() {
    this.ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'llama3.2:latest';
    
    this.ollama = new Ollama({
      host: this.ollamaHost
    });

    logger.info(`Initializing LLM service with Ollama host: ${this.ollamaHost}, model: ${this.model}`);
  }

  /**
   * Check if Ollama is available and the model is installed
   */
  async checkOllamaHealth() {
    try {
      const models = await this.ollama.list();
      const modelExists = models.models.some(model => model.name === this.model);
      
      if (!modelExists) {
        logger.warn(`Model ${this.model} not found. Available models:`, models.models.map(m => m.name));
        return { healthy: false, error: `Model ${this.model} not found` };
      }
      
      return { healthy: true };
    } catch (error) {
      logger.error('Ollama health check failed:', error.message);
      return { healthy: false, error: error.message };
    }
  }

  /**
   * Generate a personalized learning path based on user interests and available content
   */
  async generateLearningPath(userProfile, searchResults) {
    try {
      logger.info('Generating learning path for user profile:', userProfile);

      // Check Ollama health first
      const healthCheck = await this.checkOllamaHealth();
      if (!healthCheck.healthy) {
        throw new Error(`Ollama service unavailable: ${healthCheck.error}`);
      }

      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(userProfile, searchResults);
      
      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

      logger.info('Sending request to Ollama...');
      
      const response = await this.ollama.generate({
        model: this.model,
        prompt: fullPrompt,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 4000,
        },
        stream: false
      });

      const learningPath = this.parseLearningPathResponse(response.response);
      
      logger.info('Successfully generated learning path');
      return learningPath;
    } catch (error) {
      logger.error('Error generating learning path:', error.message);
      throw new Error(`Failed to generate learning path: ${error.message}`);
    }
  }

  /**
   * Build system prompt for the LLM
   */
  buildSystemPrompt() {
    return `You are an expert Red Hat learning path advisor with deep knowledge of Red Hat technologies, training programs, and documentation. Your role is to create personalized, structured learning paths based on user interests and available Red Hat content.

GUIDELINES:
1. Create learning paths that are logical, progressive, and practical
2. Only recommend Red Hat official content (Red Hat TV, documentation, training courses)
3. Structure the path from beginner to advanced levels
4. Include estimated time commitments and difficulty levels
5. Provide clear learning objectives for each step
6. Consider prerequisites and dependencies between topics
7. Include hands-on practice recommendations
8. Suggest relevant Red Hat certifications where appropriate

RESPONSE FORMAT:
You MUST respond with a valid JSON object with the following structure:
{
  "title": "Learning Path Title",
  "description": "Brief description of what the learner will achieve",
  "totalEstimatedTime": "X weeks/months",
  "difficultyLevel": "Beginner/Intermediate/Advanced",
  "prerequisites": ["List of prerequisites"],
  "learningObjectives": ["List of key learning objectives"],
  "phases": [
    {
      "phase": 1,
      "title": "Phase Title",
      "description": "What this phase covers",
      "estimatedTime": "X days/weeks",
      "difficulty": "Beginner/Intermediate/Advanced",
      "resources": [
        {
          "title": "Resource Title",
          "url": "Resource URL",
          "type": "video/documentation/training/certification",
          "source": "Red Hat TV/Red Hat Docs/Red Hat Training",
          "duration": "Duration if applicable",
          "priority": "High/Medium/Low",
          "description": "What the learner will gain from this resource"
        }
      ],
      "practiceActivities": ["List of hands-on activities"],
      "assessmentCriteria": ["How to measure progress in this phase"]
    }
  ],
  "certificationPath": {
    "recommended": ["List of relevant Red Hat certifications"],
    "sequence": ["Order in which certifications should be pursued"]
  },
  "nextSteps": ["Suggestions for continued learning beyond this path"]
}

IMPORTANT:
- Only use the provided Red Hat content in your recommendations
- Ensure all URLs and resources are from the search results provided
- Make the learning path practical and achievable
- Include specific, actionable steps
- Consider different learning styles (visual, hands-on, reading)
- Return ONLY the JSON object, no additional text or formatting`;
  }

  /**
   * Build user prompt with profile and search results
   */
  buildUserPrompt(userProfile, searchResults) {
    const { interests, experience, goals, timeCommitment, preferredLearningStyle } = userProfile;

    let prompt = `Create a personalized Red Hat learning path based on the following user profile:

USER PROFILE:
- Interests: ${interests.join(', ')}
- Experience Level: ${experience}
- Learning Goals: ${goals.join(', ')}
- Available Time Commitment: ${timeCommitment}
- Preferred Learning Style: ${preferredLearningStyle}

AVAILABLE RED HAT CONTENT:
`;

    // Add search results by category
    if (searchResults.tv && searchResults.tv.length > 0) {
      prompt += '\nRED HAT TV VIDEOS:\n';
      searchResults.tv.forEach((resource, index) => {
        prompt += `${index + 1}. ${resource.title}
   URL: ${resource.url}
   Duration: ${resource.duration || 'N/A'}
   Description: ${resource.description}
   
`;
      });
    }

    if (searchResults.documentation && searchResults.documentation.length > 0) {
      prompt += '\nRED HAT DOCUMENTATION:\n';
      searchResults.documentation.forEach((resource, index) => {
        prompt += `${index + 1}. ${resource.title}
   URL: ${resource.url}
   Description: ${resource.description}
   
`;
      });
    }

    if (searchResults.training && searchResults.training.length > 0) {
      prompt += '\nRED HAT TRAINING COURSES:\n';
      searchResults.training.forEach((resource, index) => {
        prompt += `${index + 1}. ${resource.title}
   URL: ${resource.url}
   Level: ${resource.level || 'N/A'}
   Duration: ${resource.duration || 'N/A'}
   Description: ${resource.description}
   
`;
      });
    }

    prompt += `
Please create a comprehensive, structured learning path that:
1. Matches the user's interests and experience level
2. Achieves their stated learning goals
3. Fits within their time commitment
4. Accommodates their preferred learning style
5. Uses only the Red Hat content provided above
6. Progresses logically from foundational to advanced concepts
7. Includes practical, hands-on activities
8. Suggests relevant Red Hat certifications

Return ONLY a valid JSON object following the specified format.`;

    return prompt;
  }

  /**
   * Parse the LLM response and ensure it's valid JSON
   */
  parseLearningPathResponse(response) {
    try {
      // Clean the response - remove any markdown formatting or extra text
      let cleanResponse = response.trim();
      
      // Try to extract JSON from the response
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanResponse = jsonMatch[0];
      }
      
      // Try to parse as JSON
      const parsed = JSON.parse(cleanResponse);
      
      // Validate that it has the required structure
      if (!parsed.title || !parsed.phases) {
        throw new Error('Invalid learning path structure');
      }
      
      return parsed;
    } catch (error) {
      logger.error('Failed to parse LLM response as JSON:', error.message);
      logger.debug('Raw response:', response);
      
      // Return a structured fallback response
      return {
        title: 'Custom Red Hat Learning Path',
        description: 'A personalized learning path based on your interests',
        totalEstimatedTime: '4-8 weeks',
        difficultyLevel: 'Intermediate',
        prerequisites: ['Basic Linux knowledge'],
        learningObjectives: ['Gain proficiency in Red Hat technologies'],
        phases: [
          {
            phase: 1,
            title: 'Foundation Phase',
            description: 'Build foundational knowledge',
            estimatedTime: '2-3 weeks',
            difficulty: 'Beginner',
            resources: [],
            practiceActivities: ['Hands-on labs', 'Practice exercises'],
            assessmentCriteria: ['Complete all resources', 'Demonstrate basic understanding']
          }
        ],
        certificationPath: {
          recommended: ['Red Hat Certified System Administrator (RHCSA)'],
          sequence: ['Start with RHCSA foundation']
        },
        nextSteps: ['Continue with advanced topics', 'Pursue additional certifications'],
        rawResponse: response,
        parseError: error.message
      };
    }
  }

  /**
   * Enhance search results with AI-powered content analysis
   */
  async analyzeContentRelevance(userInterests, searchResults) {
    try {
      const healthCheck = await this.checkOllamaHealth();
      if (!healthCheck.healthy) {
        logger.warn('Skipping content analysis due to Ollama unavailability');
        return searchResults;
      }

      const prompt = `Analyze the following Red Hat content and rank it by relevance to the user's interests: ${userInterests.join(', ')}.

Content to analyze:
${JSON.stringify(searchResults, null, 2)}

Return a JSON object with relevance scores (0-100) and explanations for each piece of content.
Return ONLY the JSON object, no additional text.`;

      const response = await this.ollama.generate({
        model: this.model,
        prompt: prompt,
        options: {
          temperature: 0.3,
          num_predict: 2000,
        },
        stream: false
      });

      return JSON.parse(response.response);
    } catch (error) {
      logger.error('Error analyzing content relevance:', error.message);
      return searchResults; // Return original results if analysis fails
    }
  }

  /**
   * Test the Ollama connection and model availability
   */
  async testConnection() {
    try {
      logger.info('Testing Ollama connection...');
      
      const healthCheck = await this.checkOllamaHealth();
      if (!healthCheck.healthy) {
        return { success: false, error: healthCheck.error };
      }

      // Test with a simple prompt
      const testResponse = await this.ollama.generate({
        model: this.model,
        prompt: 'Respond with just "Hello, Red Hat learning assistant ready!" and nothing else.',
        options: {
          temperature: 0.1,
          num_predict: 50,
        },
        stream: false
      });

      logger.info('Ollama test successful');
      return { 
        success: true, 
        response: testResponse.response.trim(),
        model: this.model,
        host: this.ollamaHost
      };
    } catch (error) {
      logger.error('Ollama connection test failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = LLMService;