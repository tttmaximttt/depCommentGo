local uids = cjson.decode(KEYS[1])
local ids_list_names = cjson.decode(KEYS[2])
local client_ops_list_names = cjson.decode(KEYS[3])
local user_ops_list_names = cjson.decode(KEYS[4])
local project_ops_list_names = cjson.decode(KEYS[5])

local result = {}

for i,list_name in ipairs(ids_list_names) do
    local lastId = redis.call('lindex', list_name, -1)

    if type(lastId) ~= 'string' then 
        result[uids[i]] = 0
    else
        local key = string.match(lastId, '(%w+)-');

        local last_operation_json;

        if (key == 'project') then
            last_operation_json = redis.call('lindex', project_ops_list_names[i], -1);
        elseif (key == 'user') then
            last_operation_json = redis.call('lindex', user_ops_list_names[i], -1);
        elseif (key == 'client') then
            last_operation_json = redis.call('lindex', client_ops_list_names[i], -1);
        end

        local last_operation = cjson.decode(last_operation_json)
        local action_time = last_operation.actionTime

        result[uids[i]] = action_time
    end
end

return cjson.encode(result)
