//This is an example of the security service


var _globalOptions={};

var multiTenantTools={
    createTenant:
        function(req,res,next){

        }

    ,getTenantById:
        function(req,res,next){

        }


    ,getTenantsByQuery:
        function(req,res,next){

        }

    ,updateTenantFull:
        function(req,res,next){

        }

    ,updateTenantPart:
        function(req,res,next){

        }

    ,deleteTenant:
        function(req,res,next){


        }

    ,checkTenantExists:
        function(req,res,next){

        }

    ,addAdminTenant:
        function(req,res,next){

        }

    ,resetPassword:
        function(req,res,next){


        }

    ,updatePassword:
        function(req,res,next){

        }

    ,getUsers:
        function(req,res,next){

        }

    ,createUser:
        function (req,res,next){
        }

    ,deleteUser:
        function(req,res,next){

        }

    ,updateUser:
        function(req,res,next){

        }

    ,checkTenant:
        function(req,res,next){}


    ,checkUser:
        function(req,res,next){}
}


var service= function(options){
        _globalOptions=options;
        return multiTenantTools;
}

module.exports=service;





