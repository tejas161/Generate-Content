const express = require('express');
const router = express.Router();

const RedHatContentService = require('../services/redhatContentService');
const LLMService = require('../services/llmService');
const { validateLearningPathRequest, validateSearchRequest } = require('../utils/validation');
const { logger } = require('../utils/logger');

// Initialize services
const redhatContentService = new RedHatContentService();
let llmService;

try {
  llmService = new LLMService();
  
  // Test Ollama connection on startup
  llmService.testConnection().then(result => {
    if (result.success) {
      logger.info('Ollama connection test successful:', result.response);
    } else {
      logger.error('Ollama connection test failed:', result.error);
    }
  });
} catch (error) {
  logger.error('Failed to initialize LLM service:', error.message);
}

/**
 * POST /api/learning-path/generate
 * Generate a personalized learning path based on user profile
 */
router.post('/generate', async (req, res, next) => {
  try {
    // Validate request data
    const validation = validateLearningPathRequest(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    const userProfile = validation.data;
    
    // Check if LLM service is available
    if (!llmService) {
      return res.status(500).json({
        error: 'LLM service is not available. Please check your Ollama configuration.'
      });
    }

    // Test Ollama connection
    const healthCheck = await llmService.checkOllamaHealth();
    if (!healthCheck.healthy) {
      return res.status(503).json({
        error: 'Ollama service is not available',
        details: healthCheck.error,
        suggestion: 'Make sure Ollama is running and the model is installed'
      });
    }

    logger.info('Generating learning path for user profile:', {
      interests: userProfile.interests,
      experience: userProfile.experience,
      goals: userProfile.goals
    });

    // Extract topics from user interests and goals
    const allTopics = [...userProfile.interests, ...userProfile.goals];
    const extractedTopics = redhatContentService.extractTopics(allTopics.join(' '));

    // Search for relevant Red Hat content
    const searchResults = await redhatContentService.searchAllSources(extractedTopics);

    // Generate learning path using LLM
    const learningPath = await llmService.generateLearningPath(userProfile, searchResults);

    // Add metadata to the response
    const response = {
      learningPath,
      metadata: {
        generatedAt: new Date().toISOString(),
        userProfile: {
          interests: userProfile.interests,
          experience: userProfile.experience,
          timeCommitment: userProfile.timeCommitment,
          preferredLearningStyle: userProfile.preferredLearningStyle
        },
        contentSources: {
          totalResources: searchResults.all ? searchResults.all.length : 0,
          documentation: searchResults.documentation ? searchResults.documentation.length : 0,
          training: searchResults.training ? searchResults.training.length : 0,
          videos: searchResults.videos ? searchResults.videos.length : 0
        },
        extractedTopics
      }
    };

    logger.info('Successfully generated learning path', {
      totalResources: searchResults.all.length,
      phases: learningPath.phases?.length || 0
    });

    res.json(response);
  } catch (error) {
    logger.error('Error generating learning path:', error);
    next(error);
  }
});

/**
 * POST /api/learning-path/search
 * Search Red Hat content for specific topics
 */
router.post('/search', async (req, res, next) => {
  try {
    // Validate request data
    const validation = validateSearchRequest(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    const { topics, sources } = validation.data;

    logger.info('Searching Red Hat content for topics:', topics);

    let searchResults;

    if (sources.includes('all')) {
      searchResults = await redhatContentService.searchAllSources(topics);
    } else {
      searchResults = {};
      
      if (sources.includes('tv')) {
        searchResults.tv = await redhatContentService.searchRedHatTV(topics);
      }
      
      if (sources.includes('documentation')) {
        searchResults.documentation = await redhatContentService.searchRedHatDocs(topics);
      }
      
      if (sources.includes('training')) {
        searchResults.training = await redhatContentService.searchRedHatTraining(topics);
      }

      // Combine all results
      const allResults = [
        ...(searchResults.tv || []),
        ...(searchResults.documentation || []),
        ...(searchResults.training || [])
      ];
      searchResults.all = redhatContentService.deduplicateResults(allResults);
    }

    const response = {
      results: searchResults,
      metadata: {
        searchedAt: new Date().toISOString(),
        topics,
        sources,
        totalResults: searchResults.all ? searchResults.all.length : 0
      }
    };

    logger.info('Search completed successfully', {
      topics,
      totalResults: searchResults.all ? searchResults.all.length : 0
    });

    res.json(response);
  } catch (error) {
    logger.error('Error searching Red Hat content:', error);
    next(error);
  }
});

/**
 * GET /api/learning-path/search-capabilities
 * Get search capabilities and configuration
 */
router.get('/search-capabilities', (req, res) => {
  const capabilities = redhatContentService.getSearchCapabilities();
  
  res.json({
    capabilities,
    recommendations: {
      googleSearch: capabilities.googleSearchEnabled 
        ? "Google Custom Search API is configured and ready" 
        : "Consider setting up Google Custom Search API for better search results",
      youtubeApi: capabilities.youtubeApiEnabled 
        ? "YouTube API is configured and ready" 
        : "Consider setting up YouTube API for enhanced video search",
      webScraping: capabilities.webScrapingEnabled 
        ? "Web scraping fallback is enabled" 
        : "Web scraping is disabled - API keys recommended for better results"
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/learning-path/topics
 * Get information about flexible input format
 */
router.get('/topics', (req, res) => {
  const inputGuidance = {
    message: "This API accepts flexible, open-ended input for personalized learning paths",
    fieldDescriptions: {
      interests: {
        description: "Any technologies, topics, or areas you want to learn about",
        examples: ["OpenShift", "Kubernetes", "DevOps", "Cloud Security", "Machine Learning with Red Hat", "Enterprise Linux Administration"],
        format: "Array of strings (1-20 items, max 200 chars each)",
        note: "Be as specific or general as you like"
      },
      experience: {
        description: "Your current experience level in your own words",
        examples: ["Complete beginner", "5 years in system administration", "Intermediate developer with some cloud experience", "Expert in Linux but new to containers"],
        format: "String (max 100 characters)",
        note: "Describe your background however feels most accurate"
      },
      goals: {
        description: "What you want to achieve through learning",
        examples: ["Get RHCSA certified", "Deploy applications in production", "Automate infrastructure", "Become a cloud architect", "Lead a DevOps team"],
        format: "Array of strings (1-10 items, max 300 chars each)",
        note: "Include both short-term and long-term goals"
      },
      timeCommitment: {
        description: "How much time you can dedicate to learning",
        examples: ["2-3 hours per week", "Full-time intensive study", "30 minutes daily", "Weekends only", "Whatever it takes to get certified"],
        format: "String (max 100 characters)",
        note: "Be realistic about your schedule"
      },
      preferredLearningStyle: {
        description: "How you learn best",
        examples: ["Hands-on labs and practice", "Video tutorials", "Reading documentation", "Mix of theory and practice", "Learning by building projects"],
        format: "String (max 100 characters)",
        note: "Describe your ideal learning approach"
      }
    },
    sampleRequest: {
      interests: ["OpenShift", "Container orchestration", "Cloud-native development"],
      experience: "3 years as a system admin, new to containers",
      goals: ["Deploy microservices in production", "Get OpenShift certified"],
      timeCommitment: "5-8 hours per week",
      preferredLearningStyle: "Hands-on practice with real projects"
    }
  };

  res.json({
    guidance: inputGuidance,
    metadata: {
      retrievedAt: new Date().toISOString(),
      validationNote: "All fields accept flexible, user-defined input"
    }
  });
});

/**
 * GET /api/learning-path/test-ollama
 * Test Ollama connection and model availability
 */
router.get('/test-ollama', async (req, res, next) => {
  try {
    if (!llmService) {
      return res.status(500).json({
        error: 'LLM service is not initialized'
      });
    }

    const testResult = await llmService.testConnection();
    
    if (testResult.success) {
      res.json({
        status: 'success',
        message: 'Ollama connection successful',
        model: testResult.model,
        host: testResult.host,
        response: testResult.response,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'failed',
        error: testResult.error,
        suggestions: [
          'Make sure Ollama is running: ollama serve',
          `Make sure model is installed: ollama pull ${process.env.OLLAMA_MODEL || 'llama3.2:latest'}`,
          'Check if Ollama is accessible at: ' + (process.env.OLLAMA_HOST || 'http://localhost:11434')
        ],
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Error testing Ollama connection:', error);
    next(error);
  }
});

/**
 * GET /api/learning-path/status
 * Get service status and health information
 */
router.get('/status', async (req, res) => {
  const status = {
    service: 'Red Hat Learning Path Generator',
    status: 'operational',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      redhatContentService: 'operational',
      llmService: llmService ? 'initialized' : 'unavailable'
    },
    environment: process.env.NODE_ENV || 'development',
    configuration: {
      ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',
      ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2:latest'
    }
  };

  // Test Ollama if service is available
  if (llmService) {
    try {
      const healthCheck = await llmService.checkOllamaHealth();
      status.services.llmService = healthCheck.healthy ? 'operational' : 'unavailable';
      
      if (!healthCheck.healthy) {
        status.status = 'degraded';
        status.warnings = [healthCheck.error];
      }
    } catch (error) {
      status.services.llmService = 'error';
      status.status = 'degraded';
      status.warnings = ['Failed to check Ollama health: ' + error.message];
    }
  } else {
    status.status = 'degraded';
    status.warnings = ['LLM service is not available - check Ollama configuration'];
  }

  res.json(status);
});

module.exports = router;
