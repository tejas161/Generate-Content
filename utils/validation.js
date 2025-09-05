const Joi = require('joi');

const learningPathRequestSchema = Joi.object({
  interests: Joi.array()
    .items(Joi.string().trim().min(1).max(200))
    .min(1)
    .max(20)
    .required()
    .messages({
      'array.min': 'At least one interest is required',
      'array.max': 'Maximum 20 interests allowed',
      'any.required': 'Interests are required'
    }),
  
  experience: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.min': 'Experience level cannot be empty',
      'string.max': 'Experience level must be less than 100 characters',
      'any.required': 'Experience level is required'
    }),
  
  goals: Joi.array()
    .items(Joi.string().trim().min(1).max(300))
    .min(1)
    .max(10)
    .required()
    .messages({
      'array.min': 'At least one learning goal is required',
      'array.max': 'Maximum 10 learning goals allowed',
      'any.required': 'Learning goals are required'
    }),
  
  timeCommitment: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.min': 'Time commitment cannot be empty',
      'string.max': 'Time commitment must be less than 100 characters',
      'any.required': 'Time commitment is required'
    }),
  
  preferredLearningStyle: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.min': 'Preferred learning style cannot be empty',
      'string.max': 'Preferred learning style must be less than 100 characters',
      'any.required': 'Preferred learning style is required'
    }),
  
  currentRole: Joi.string()
    .trim()
    .max(100)
    .optional()
    .allow(''),
  
  industryFocus: Joi.string()
    .trim()
    .max(100)
    .optional()
    .allow(''),
  
  certificationGoals: Joi.array()
    .items(Joi.string().trim().max(100))
    .max(5)
    .optional()
    .default([]),
  
  additionalContext: Joi.string()
    .trim()
    .max(500)
    .optional()
    .allow('')
});

const validateLearningPathRequest = (data) => {
  const { error, value } = learningPathRequestSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errorDetails = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value
    }));

    return {
      isValid: false,
      errors: errorDetails,
      data: null
    };
  }

  return {
    isValid: true,
    errors: null,
    data: value
  };
};

const searchRequestSchema = Joi.object({
  topics: Joi.array()
    .items(Joi.string().trim().min(1).max(100))
    .min(1)
    .max(10)
    .required()
    .messages({
      'array.min': 'At least one topic is required',
      'array.max': 'Maximum 10 topics allowed',
      'any.required': 'Topics are required'
    }),
  
  sources: Joi.array()
    .items(Joi.string().valid('tv', 'documentation', 'training', 'all'))
    .default(['all'])
    .optional()
});

const validateSearchRequest = (data) => {
  const { error, value } = searchRequestSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errorDetails = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value
    }));

    return {
      isValid: false,
      errors: errorDetails,
      data: null
    };
  }

  return {
    isValid: true,
    errors: null,
    data: value
  };
};

module.exports = {
  validateLearningPathRequest,
  validateSearchRequest,
  learningPathRequestSchema,
  searchRequestSchema
};
