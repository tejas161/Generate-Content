const axios = require('axios');
const cheerio = require('cheerio');
const { logger } = require('../utils/logger');

class RedHatContentService {
  constructor() {
    this.maxResults = parseInt(process.env.MAX_SEARCH_RESULTS) || 15;
    this.searchTimeout = parseInt(process.env.SEARCH_TIMEOUT_MS) || 10000;
    this.userAgent = process.env.USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    
    this.axiosInstance = axios.create({
      timeout: this.searchTimeout,
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
  }
 

  /**
   * Search DuckDuckGo for Red Hat documentation
   */
  async searchRedHatDocs(topics) {
    try {
      logger.info(`Searching Red Hat documentation for topics: ${topics.join(', ')}`);
      
      const searchResults = [];
      
      for (const topic of topics) {
        try {
          // Simplified queries that are more likely to work
          const queries = [
            `"Red Hat" "${topic}" documentation`,
            // `"Red Hat" "${topic}" guide`
          ];
          
          for (const query of queries) {
            const results = await this.performDuckDuckGoSearch(query, 'Red Hat Docs');
            searchResults.push(...results);
          }
        } catch (error) {
          logger.error(`Error searching Red Hat docs for topic ${topic}:`, error.message);
        }
      }
      
      // Always ensure we have some results for documentation
      if (searchResults.length === 0) {
        // searchResults.push(...this.generateFallbackResults(topics.join(' '), 'Red Hat Docs'));
      }

      return this.deduplicateResults(searchResults);
    } catch (error) {
      logger.error('Error searching Red Hat documentation:', error.message);
      return [];
    }
  }

  /**
   * Search DuckDuckGo for Red Hat training content
   */
  async searchRedHatTraining(topics) {
    try {
      logger.info(`Searching Red Hat training for topics: ${topics.join(', ')}`);
      
      const searchResults = [];
      
      for (const topic of topics) {
        try {
          // Simplified queries that are more likely to work
          const queries = [
            `"Red Hat training" "${topic}"`,
            `"Red Hat certification" "${topic}"`
          ];
          
          for (const query of queries) {
            const results = await this.performDuckDuckGoSearch(query, 'Red Hat Training');
            searchResults.push(...results);
          }
        } catch (error) {
          logger.error(`Error searching Red Hat training for topic ${topic}:`, error.message);
        }
      }
      
      // Always ensure we have some results for training
      if (searchResults.length === 0) {
        // searchResults.push(...this.generateFallbackResults(topics.join(' '), 'Red Hat Training'));
      }

      return this.deduplicateResults(searchResults);
    } catch (error) {
      logger.error('Error searching Red Hat training:', error.message);
      return [];
    }
  }

  /**
   * Search DuckDuckGo for Red Hat videos (TV and YouTube)
   */
  async searchRedHatVideos(topics) {
    try {
      logger.info(`Searching Red Hat videos for topics: ${topics.join(', ')}`);
      
      const searchResults = [];
      
      for (const topic of topics) {
        try {
          const queries = [
            // Red Hat TV specific searches
            `site:tv.redhat.com "${topic}"`,
            // `site:tv.redhat.com "${topic}" video`,
            // `"tv.redhat.com" "${topic}"`,
            // YouTube searches
            // `site:youtube.com "Red Hat" "${topic}" video`,
            // `site:youtube.com "@RedHat" "${topic}"`,
            // General video searches
            // `"Red Hat TV" "${topic}"`,
            // `"Red Hat" "${topic}" video tutorial`,
            // `"Red Hat" "${topic}" webinar`
          ];
          
          for (const query of queries) {
            const results = await this.performDuckDuckGoSearch(query, 'Red Hat Videos');
            searchResults.push(...results);
          }
        } catch (error) {
          logger.error(`Error searching Red Hat videos for topic ${topic}:`, error.message);
        }
      }
      
      // Always ensure we have some video results
      if (searchResults.length === 0) {
        // searchResults.push(...this.generateFallbackVideoResults(topics.join(' '), 'Red Hat Videos'));
      }

      return this.deduplicateResults(searchResults);
    } catch (error) {
      logger.error('Error searching Red Hat videos:', error.message);
      return [];
    }
  }

  /**
   * Perform DuckDuckGo search and scrape results
   */
  async performDuckDuckGoSearch(query, source = 'DuckDuckGo') {
    try {
      logger.debug(`Performing DuckDuckGo search: "${query}"`);
      
      // Add delay to avoid rate limiting
      await this.delay(Math.random() * 1000 + 500);
      
      // Use DuckDuckGo HTML search (better for scraping)
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      
      const response = await this.axiosInstance.get(searchUrl, {
        headers: {
          ...this.axiosInstance.defaults.headers,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      const $ = cheerio.load(response.data);
      const results = [];
      
      // Use the correct selectors for DuckDuckGo HTML version
      const resultSelectors = [
        '.result',
        '.results_links',
        '.result__body'
      ];
      
      let foundResults = false;
      
      for (const selector of resultSelectors) {
        if (foundResults) break;
        
        $(selector).each((index, element) => {
          if (index >= this.maxResults) return false;
          
          const $element = $(element);
          
          // Extract title and URL using DuckDuckGo HTML selectors
          let title = $element.find('.result__title a, .result-title a').first().text().trim();
          let url = $element.find('.result__title a, .result-title a').first().attr('href');
          let description = $element.find('.result__snippet, .snippet').first().text().trim();
          
          // Fallback extraction methods
          if (!title) {
            title = $element.find('a').first().text().trim();
          }
          if (!url) {
            url = $element.find('a').first().attr('href');
          }
          if (!description) {
            description = $element.text().replace(title, '').trim().substring(0, 200);
          }
          
          // Clean up the URL
          if (url) {
            if (url.startsWith('/l/?uddg=')) {
              try {
                const urlParams = new URLSearchParams(url.split('?')[1]);
                url = decodeURIComponent(urlParams.get('uddg'));
              } catch (e) {
                url = null;
              }
            } else if (url.startsWith('/')) {
              url = `https://duckduckgo.com${url}`;
            }
          }
          
          // Only include valid Red Hat related results
          if (title && url && this.isRedHatRelated(title, url, description)) {
            results.push({
              title: this.cleanTitle(title),
              url: url,
              description: this.cleanDescription(description),
              type: this.determineContentType(url, title),
              source: source,
              searchQuery: query,
              domain: this.extractDomain(url)
            });
            foundResults = true;
          }
        });
      }
      
      // If no results found, try a fallback approach with mock data based on query
      if (results.length === 0) {
        logger.debug(`No results from DuckDuckGo, generating fallback results for: "${query}"`);
        // return this.generateFallbackResults(query, source);
      }
      
      logger.debug(`Found ${results.length} results for query: "${query}"`);
      return results;
      
    } catch (error) {
      logger.error(`DuckDuckGo search failed for query "${query}":`, error.message);
      // Return fallback results on error
      // return this.generateFallbackResults(query, source);
    }
  }

  /**
   * Add delay for rate limiting
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate fallback results when search fails
   */
  generateFallbackResults(query, source) {
    const results = [];
    const queryLower = query.toLowerCase();
    
    // Generate realistic Red Hat content based on the search query
    if (queryLower.includes('openshift')) {
      results.push(
        {
          title: 'Red Hat OpenShift Documentation',
          url: 'https://docs.redhat.com/en/documentation/openshift_container_platform',
          description: 'Complete documentation for Red Hat OpenShift Container Platform',
          type: 'documentation',
          source: source,
          searchQuery: query,
          domain: 'docs.redhat.com'
        },
        {
          title: 'Getting Started with OpenShift',
          url: 'https://www.redhat.com/en/technologies/cloud-computing/openshift',
          description: 'Learn about Red Hat OpenShift, the enterprise Kubernetes platform',
          type: 'article',
          source: source,
          searchQuery: query,
          domain: 'redhat.com'
        }
      );
    }
    
    if (queryLower.includes('ansible')) {
      results.push(
        {
          title: 'Ansible Automation Platform Documentation',
          url: 'https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform',
          description: 'Documentation for Red Hat Ansible Automation Platform',
          type: 'documentation',
          source: source,
          searchQuery: query,
          domain: 'docs.redhat.com'
        },
        {
          title: 'Red Hat Ansible Training',
          url: 'https://www.redhat.com/en/services/training/all-courses-exams?f[0]=taxonomy_training_course_type%3A799',
          description: 'Ansible training courses and certifications from Red Hat',
          type: 'training',
          source: source,
          searchQuery: query,
          domain: 'redhat.com'
        }
      );
    }
    
    if (queryLower.includes('rhel') || queryLower.includes('linux')) {
      results.push(
        {
          title: 'Red Hat Enterprise Linux Documentation',
          url: 'https://docs.redhat.com/en/documentation/red_hat_enterprise_linux',
          description: 'Complete RHEL documentation and system administration guides',
          type: 'documentation',
          source: source,
          searchQuery: query,
          domain: 'docs.redhat.com'
        }
      );
    }
    
    if (queryLower.includes('training') || queryLower.includes('certification')) {
      results.push(
        {
          title: 'Red Hat Training and Certification',
          url: 'https://www.redhat.com/en/services/training',
          description: 'Red Hat training courses and certification programs',
          type: 'training',
          source: source,
          searchQuery: query,
          domain: 'redhat.com'
        }
      );
    }
    
    // Generic Red Hat results if no specific matches
    if (results.length === 0) {
      results.push(
        {
          title: 'Red Hat Customer Portal',
          url: 'https://access.redhat.com/',
          description: 'Access Red Hat documentation, support, and resources',
          type: 'documentation',
          source: source,
          searchQuery: query,
          domain: 'access.redhat.com'
        },
        {
          title: 'Red Hat Developer',
          url: 'https://developers.redhat.com/',
          description: 'Resources and tools for Red Hat developers',
          type: 'article',
          source: source,
          searchQuery: query,
          domain: 'developers.redhat.com'
        }
      );
    }
    
    return results.slice(0, Math.min(3, this.maxResults));
  }

  /**
   * Generate fallback video results when video search fails
   */
  generateFallbackVideoResults(query, source) {
    const results = [];
    const queryLower = query.toLowerCase();
    
    // Generate realistic Red Hat TV and video content based on the search query
    if (queryLower.includes('openshift')) {
      results.push(
        {
          title: 'Navigating tomorrow: Red Hat OpenShift\'s roadmap in 2025 and beyond',
          url: 'https://tv.redhat.com/detail/6376346795112/navigating-tomorrow-red-hat-openshifts-roadmap-in-2025-and-beyond',
          description: 'Discover the future of Red Hat OpenShift and see how we continue to redefine container orchestration and application deployment across the hybrid cloud.',
          type: 'video',
          source: source,
          searchQuery: query,
          domain: 'tv.redhat.com'
        },
        {
          title: 'Introduction to OpenShift Virtualization - Part 1',
          url: 'https://tv.redhat.com/detail/6370254516112/introduction-to-openshift-virtualization-part-1',
          description: 'Red Hat OpenShift Virtualization is an add-on component to Red Hat OpenShift that allows you to run virtualized workloads in the same infrastructure as your existing containerized workloads.',
          type: 'video',
          source: source,
          searchQuery: query,
          domain: 'tv.redhat.com'
        }
      );
    }
    
    if (queryLower.includes('ansible')) {
      results.push(
        {
          title: 'The future of automation: Red Hat Ansible Automation Platform roadmap',
          url: 'https://tv.redhat.com/detail/6370134335114/the-future-of-automation-red-hat-ansible-automation-platform-roadmap',
          description: 'Explore Ansible\'s automation roadmap and discover new features coming to the Red Hat Ansible Automation Platform.',
          type: 'video',
          source: source,
          searchQuery: query,
          domain: 'tv.redhat.com'
        },
        {
          title: 'Super-sized network orchestration with Ansible',
          url: 'https://tv.redhat.com/detail/6370134335115/super-sized-network-orchestration-with-ansible',
          description: 'Learn advanced network automation techniques using Red Hat Ansible for large-scale infrastructure management.',
          type: 'video',
          source: source,
          searchQuery: query,
          domain: 'tv.redhat.com'
        }
      );
    }
    
    if (queryLower.includes('rhel') || queryLower.includes('linux')) {
      results.push(
        {
          title: 'The Red Hat Enterprise Linux 10 roadmap: Reimagining a Linux platform',
          url: 'https://tv.redhat.com/detail/6370134335116/the-red-hat-enterprise-linux-10-roadmap-reimagining-a-linux-platform',
          description: 'Discover RHEL 10 features and development roadmap for the next generation of enterprise Linux.',
          type: 'video',
          source: source,
          searchQuery: query,
          domain: 'tv.redhat.com'
        }
      );
    }
    
    if (queryLower.includes('ai') || queryLower.includes('artificial intelligence')) {
      results.push(
        {
          title: 'Red Hat AI roadmap: Our vision and strategy',
          url: 'https://tv.redhat.com/detail/6370134335118/red-hat-ai-roadmap-our-vision-and-strategy',
          description: 'Learn about Red Hat\'s comprehensive AI strategy and roadmap for artificial intelligence technologies.',
          type: 'video',
          source: source,
          searchQuery: query,
          domain: 'tv.redhat.com'
        },
        {
          title: 'AI inferencing for developers and administrators',
          url: 'https://tv.redhat.com/detail/6370134335119/ai-inferencing-for-developers-and-administrators',
          description: 'Practical AI inferencing techniques and tools for developers and system administrators.',
          type: 'video',
          source: source,
          searchQuery: query,
          domain: 'tv.redhat.com'
        }
      );
    }
    
    // Generic Red Hat TV content if no specific matches
    if (results.length === 0) {
      results.push(
        {
          title: 'Red Hat TV - Latest Videos and Webinars',
          url: 'https://tv.redhat.com/',
          description: 'Explore the latest Red Hat videos, webinars, and technical content on Red Hat TV.',
          type: 'video',
          source: source,
          searchQuery: query,
          domain: 'tv.redhat.com'
        },
        {
          title: 'Red Hat Summit 2025: Ecosystem keynote',
          url: 'https://tv.redhat.com/detail/6370134335120/red-hat-summit-2025-ecosystem-keynote',
          description: 'Watch the Red Hat Summit 2025 ecosystem keynote featuring the latest innovations and partnerships.',
          type: 'video',
          source: source,
          searchQuery: query,
          domain: 'tv.redhat.com'
        }
      );
    }
    
    return results.slice(0, Math.min(3, this.maxResults));
  }

  /**
   * Check if content is Red Hat related
   */
  isRedHatRelated(title, url, description) {
    const redhatKeywords = [
      'red hat', 'redhat', 'openshift', 'ansible', 'rhel', 
      'fedora', 'centos', 'jboss', 'wildfly', 'ceph', 
      'gluster', 'satellite', 'insights', 'quay', 'tekton'
    ];
    
    const redhatDomains = [
      'redhat.com', 'tv.redhat.com', 'access.redhat.com',
      'docs.redhat.com', 'docs.ansible.com', 'console.redhat.com',
      'catalog.redhat.com', 'developers.redhat.com'
    ];
    
    const content = `${title} ${url} ${description}`.toLowerCase();
    
    // Check for Red Hat keywords
    const hasRedHatKeywords = redhatKeywords.some(keyword => content.includes(keyword));
    
    // Check for Red Hat domains
    const hasRedHatDomain = redhatDomains.some(domain => url.toLowerCase().includes(domain));
    
    // Special case for YouTube - must have Red Hat in title or description
    if (url.includes('youtube.com')) {
      return hasRedHatKeywords && (
        title.toLowerCase().includes('red hat') || 
        description.toLowerCase().includes('red hat') ||
        title.toLowerCase().includes('openshift') ||
        title.toLowerCase().includes('ansible')
      );
    }
    
    return hasRedHatKeywords || hasRedHatDomain;
  }

  /**
   * Clean and format title
   */
  cleanTitle(title) {
    return title
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\-\(\)\[\]\.,:;!?'"]/g, '')
      .trim();
  }

  /**
   * Clean and format description
   */
  cleanDescription(description) {
    return description
      .replace(/\s+/g, ' ')
      .replace(/^\.\.\.\s*/, '')
      .replace(/\s*\.\.\.$/, '')
      .trim();
  }

  /**
   * Determine content type based on URL and title
   */
  determineContentType(url, title = '') {
    if (!url) return 'unknown';
    
    const urlLower = url.toLowerCase();
    const titleLower = title.toLowerCase();
    
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
      return 'video';
    } else if (urlLower.includes('tv.redhat.com')) {
      return 'video';
    } else if (
      urlLower.includes('docs.') || 
      urlLower.includes('documentation') || 
      urlLower.includes('access.redhat.com') ||
      titleLower.includes('documentation') ||
      titleLower.includes('guide')
    ) {
      return 'documentation';
    } else if (
      urlLower.includes('training') || 
      urlLower.includes('certification') || 
      urlLower.includes('course') ||
      titleLower.includes('training') ||
      titleLower.includes('certification') ||
      titleLower.includes('course')
    ) {
      return 'training';
    } else if (urlLower.includes('.pdf')) {
      return 'pdf';
    } else if (
      titleLower.includes('video') || 
      titleLower.includes('tutorial') ||
      titleLower.includes('demo')
    ) {
      return 'video';
    }
    
    return 'article';
  }

  /**
   * Generate comprehensive search results for all Red Hat sources
   */
  async searchAllSources(topics) {
    try {
      logger.info(`Searching all Red Hat sources for topics: ${topics.join(', ')}`);
      
              // Perform all searches in parallel for better performance
        const [docsResults, trainingResults, videoResults] = await Promise.allSettled([
          this.searchRedHatDocs(topics),
          this.searchRedHatTraining(topics),
          this.searchRedHatVideos(topics)
        ]);


      const documentation = docsResults.status === 'fulfilled' ? docsResults.value : [];
      const training = trainingResults.status === 'fulfilled' ? trainingResults.value : [];
      const videos = videoResults.status === 'fulfilled' ? videoResults.value : [];

      // Log any failures
      [docsResults, trainingResults, videoResults].forEach((result, index) => {
        if (result.status === 'rejected') {
          const sources = ['Documentation', 'Training', 'Videos'];
          logger.error(`Search failed for ${sources[index]}:`, result.reason);
        }
      });

      // Combine all results
      const allResults = [
        ...documentation,
        ...training,
        ...videos
      ];

      const deduplicatedResults = this.deduplicateResults(allResults);

      logger.info(`Search completed: ${deduplicatedResults.length} unique results found`);

              return {
          documentation: documentation,
          training: training,
          videos: videos,
          all: deduplicatedResults
        };
    } catch (error) {
      logger.error('Error searching all Red Hat sources:', error.message);
      throw error;
    }
  }

  /**
   * Remove duplicate results based on title similarity and URL
   */
  deduplicateResults(results) {
    const seen = new Set();
    const uniqueResults = [];
    
    for (const result of results) {
      if (!result.title || !result.url) continue;
      
      // Create a key based on normalized title and domain
      const normalizedTitle = result.title.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      const domain = this.extractDomain(result.url);
      const key = `${normalizedTitle.substring(0, 50)}-${domain}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        uniqueResults.push(result);
      }
    }
    
    // Sort results by relevance (Red Hat domains first, then by type)
    return uniqueResults.sort((a, b) => {
      const aIsRedHatDomain = a.domain.includes('redhat.com');
      const bIsRedHatDomain = b.domain.includes('redhat.com');
      
      if (aIsRedHatDomain && !bIsRedHatDomain) return -1;
      if (!aIsRedHatDomain && bIsRedHatDomain) return 1;
      
      // Prioritize videos and training content
      const typeOrder = { video: 1, training: 2, documentation: 3, article: 4, pdf: 5 };
      const aOrder = typeOrder[a.type] || 6;
      const bOrder = typeOrder[b.type] || 6;
      
      return aOrder - bOrder;
    });
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Extract topics from user input using enhanced keyword matching
   */
  extractTopics(userInput) {
    const input = userInput.toLowerCase();
    const topics = [];
    
    const topicKeywords = {
      'openshift': ['openshift', 'kubernetes', 'k8s', 'containers', 'orchestration', 'pods', 'deployment'],
      'ansible': ['ansible', 'automation', 'playbook', 'configuration management', 'infrastructure as code'],
      'rhel': ['rhel', 'red hat enterprise linux', 'linux', 'system administration', 'centos', 'fedora'],
      'ai': ['ai', 'artificial intelligence', 'machine learning', 'ml', 'data science', 'neural networks'],
      'cloud': ['cloud', 'aws', 'azure', 'gcp', 'hybrid cloud', 'multi-cloud', 'cloud native'],
      'security': ['security', 'selinux', 'compliance', 'vulnerability', 'cybersecurity', 'encryption'],
      'networking': ['networking', 'network', 'tcp', 'ip', 'dns', 'firewall', 'load balancer'],
      'storage': ['storage', 'ceph', 'gluster', 'persistent volume', 'block storage', 'object storage'],
      'monitoring': ['monitoring', 'prometheus', 'grafana', 'observability', 'metrics', 'alerting'],
      'devops': ['devops', 'ci/cd', 'pipeline', 'deployment', 'continuous integration', 'gitops'],
      'virtualization': ['virtualization', 'vm', 'virtual machine', 'hypervisor', 'kvm', 'qemu'],
      'middleware': ['middleware', 'jboss', 'wildfly', 'apache', 'tomcat', 'application server']
    };

    // Find matching topics
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => input.includes(keyword))) {
        topics.push(topic);
      }
    }

    // If no specific topics found, extract potential topics from the input
    if (topics.length === 0) {
      const words = input.split(/\s+/)
        .filter(word => word.length > 3)
        .filter(word => !['want', 'learn', 'need', 'help', 'with', 'about', 'from', 'that', 'this', 'they', 'have', 'will', 'been'].includes(word));
      
      topics.push(...words.slice(0, 3)); // Take first 3 meaningful words
    }

    return [...new Set(topics)]; // Remove duplicates
  }

  /**
   * Get search capabilities and status
   */
  getSearchCapabilities() {
    return {
      searchEngine: 'DuckDuckGo',
      maxResults: this.maxResults,
      searchTimeout: this.searchTimeout,
      supportedSources: ['Red Hat TV', 'Documentation', 'Training', 'Videos'],
      supportedTypes: ['video', 'documentation', 'training', 'article', 'pdf'],
      redHatDomains: [
        'redhat.com',
        'tv.redhat.com',
        'docs.redhat.com',
        'docs.ansible.com',
        'console.redhat.com',
        'catalog.redhat.com',
        'developers.redhat.com'
      ]
    };
  }
}

module.exports = RedHatContentService;