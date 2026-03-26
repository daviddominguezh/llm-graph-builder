 SELECT jsonb_pretty(messages_sent)                                                                                                                       
  FROM agent_execution_nodes             
  WHERE execution_id = '67e39a63-a0d4-4e90-8746-42c45c7e2022'                                                                                              
    AND node_id = 'create_recipe'                                                                                                                          
  LIMIT 1; 